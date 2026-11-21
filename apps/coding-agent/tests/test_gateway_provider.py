"""The Generic AI Gateway speaks the 17 Nov 2026 client wire, and leaves serving alone."""

from __future__ import annotations

import json

import httpx
import pytest

from api.adapters.llm.discovery import DiscoveryResult
from api.adapters.llm.discovery.gateway import GatewayDiscovery
from api.adapters.llm.providers import adapter_for
from api.adapters.llm.providers.gateway import (
    CircuitBreaker,
    CircuitOpen,
    GatewayClient,
    anthropic_body,
    api_headers,
    chat_body,
    chat_url,
    decode_maps,
    make_strict_schema,
    _probe_state,
    parse_sse,
)
from api.adapters.llm.store.memory import MemoryRegistryStore
from api.adapters.llm.store.seed import load
from api.adapters.llm.vault.local import EnvVault
from api.config import settings
from api.domain.llm import CredentialKind, ModelId, ModelState, ProviderKind, WireProtocol
from api.domain.llm.agent_config import AgentConfig
from api.domain.llm.custom import InvalidModel, custom_model
from api.services.credential_service import CredentialService
from api.services.health_service import HealthService
from api.services.model_resolver import ModelResolver
from api.services.model_service import ModelService
from api.ports import Secret


BASE = "https://gw.example.com/xaia"
KEY = "fixture-gateway-key-0001"


def test_the_chat_url_is_the_deployments_path_with_api_key():
    url = chat_url(BASE, "gpt-5.6-terra", "2024-08-01-preview")
    assert url == (
        f"{BASE}/openai/deployments/gpt-5.6-terra/chat/completions?api-version=2024-08-01-preview"
    )
    body = chat_body(
        [{"role": "user", "content": "ok"}], 8192, "gpt-5.6-terra",
    )
    assert set(body) == {"messages", "max_completion_tokens"}
    headers = api_headers(KEY)
    assert headers["api-key"] == KEY
    assert "Authorization" not in headers
    assert "x-api-key" not in headers


def test_reasoning_and_claude_omit_temperature_and_gpt_5_5_is_not_seeded():
    body = chat_body(
        [{"role": "user", "content": "ok"}], 8192, "gpt-5.6-sol", temperature=0.2,
    )
    assert "temperature" not in body
    claude = anthropic_body(
        [{"role": "system", "content": "be brief"}, {"role": "user", "content": "ok"}],
        "claude-sonnet-5", 8192,
    )
    assert claude["model"] == "claude-sonnet-5"
    assert claude["max_tokens"] == 8192
    assert claude["system"] == "be brief"
    assert "temperature" not in claude
    seed = load()
    assert seed.default_model == "google_vertex/google/gemini-3.8-flash"
    ids = {m.id.value for m in seed.models}
    assert "gateway/gpt-5.5" not in ids
    sol = next(m for m in seed.models if m.id.value == "gateway/gpt-5.6-sol")
    assert sol.limits.output == 8192
    assert sol.sees_images is False


def test_strict_schema_closes_objects_and_decodes_maps():
    original = {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "tags": {"type": "object", "additionalProperties": {"type": "string"}},
        },
    }
    patched = make_strict_schema(original)
    assert patched["additionalProperties"] is False
    assert patched["required"] == ["name", "tags"]
    assert patched["properties"]["tags"]["type"] == "array"
    decoded = decode_maps(
        [{"key": "a", "value": "b"}],
        original["properties"]["tags"],
    )
    assert decoded == {"a": "b"}


def test_a_usage_chunk_without_choices_is_kept():
    text, usage = parse_sse(
        "\n".join([
            'data: {"choices":[{"delta":{"content":"hello "}}]}',
            'data: {"choices":[{"delta":{"content":"world"}}]}',
            'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
            "data: [DONE]",
            'data: {"choices":[{"delta":{"content":"ignored"}}]}',
        ])
    )
    assert text == "hello world"
    assert usage["prompt_tokens"] == 3
    assert usage["completion_tokens"] == 2


async def test_the_breaker_stops_the_sixth_call_until_the_cooldown():
    clock = {"now": 0.0}
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(503, json={"error": "down"})

    client = GatewayClient(
        BASE, KEY, max_retries=0,
        breaker=CircuitBreaker(clock=lambda: clock["now"]),
        sleeper=_no_sleep,
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    for _ in range(5):
        response = await client.request("POST", chat_url(BASE, "gpt-5.6-terra"), json_body={})
        assert response.status_code == 503
    with pytest.raises(CircuitOpen):
        await client.request("POST", chat_url(BASE, "gpt-5.6-terra"), json_body={})
    assert len(seen) == 5
    clock["now"] = 61.0
    await client.request("POST", chat_url(BASE, "gpt-5.6-terra"), json_body={})
    assert len(seen) == 6


async def _no_sleep(_seconds: float) -> None:
    return None


async def test_discovery_reads_models_and_does_not_call_openai_models():
    def handle(request: httpx.Request) -> httpx.Response:
        assert "/openai/models" not in str(request.url)
        assert request.url.path.endswith("/deployments")
        assert request.headers["api-key"] == KEY
        assert "authorization" not in {k.lower() for k in request.headers}
        return httpx.Response(200, json={
            "models": [{"name": "gpt-5.6-luna", "format": "OpenAI", "capabilities": []}],
        })

    discovery = GatewayDiscovery(
        BASE, KEY, client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    result = await discovery.fetch(None)
    assert result.readable
    assert [spec.id.value for spec in result.specs] == ["gateway/gpt-5.6-luna"]
    assert result.specs[0].wire is WireProtocol.GATEWAY_OPENAI


async def test_a_405_names_the_deployment_and_an_empty_base_does_not_post(monkeypatch):
    monkeypatch.delenv("APP_LLM_GATEWAY_BASE_URL", raising=False)
    monkeypatch.delenv("XAIA_BASE_URL", raising=False)
    settings.cache_clear()

    def refuse(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"posted to {request.url}")

    adapter = adapter_for(ProviderKind.GATEWAY)
    state, detail = await adapter.probe(
        adapter.descriptor(_gateway_spec()),
        Secret(value=KEY, kind="api_key", ref="env:gateway"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(refuse)),
    )
    assert state == "degraded"
    assert "APP_LLM_GATEWAY_BASE_URL" in detail

    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", BASE)
    settings.cache_clear()

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.headers["api-key"] == KEY
        assert "authorization" not in {k.lower() for k in request.headers}
        assert request.url.path.endswith("/chat/completions")
        body = request.read()
        assert b"max_completion_tokens" in body
        assert b"max_tokens" not in body
        assert b'"model"' not in body
        return httpx.Response(405, json={"error": "not allowed"})

    state, detail = await adapter.probe(
        adapter.descriptor(_gateway_spec("gpt-5.6-terra")),
        Secret(value=KEY, kind="api_key", ref="env:gateway"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    assert state == "unauthorised"
    assert detail == "This key cannot call gpt-5.6-terra."
    settings.cache_clear()


def test_custom_model_still_rejects_a_typed_gateway_row():
    with pytest.raises(InvalidModel):
        custom_model(ProviderKind.GATEWAY, "gpt-5.5", context=64_000, output=8192)


def test_aliases_still_rewrite_serving_ids_and_leave_gateway_ids_alone():
    assert ModelId.parse("databricks/system.ai.gpt-oss-120b").value == (
        "databricks/databricks-gpt-oss-120b"
    )
    assert ModelId.parse("gateway/gpt-5.6-sol").provider is ProviderKind.GATEWAY


async def test_external_off_keeps_the_row_and_serving_stays_selectable():
    store = MemoryRegistryStore()
    gateway = _gateway_spec()
    serving = _serving()
    await store.upsert_model(gateway)
    await store.upsert_model(serving)
    catalogue = await ModelService(store, None, allow_external=False).catalogue("person")
    rows = {spec.id.value: spec for spec in catalogue.models}
    assert rows["gateway/gpt-5.6-terra"].selectable is False
    assert "external providers are disabled" in rows["gateway/gpt-5.6-terra"].refusal
    assert rows["databricks/databricks-llama-4-maverick"].selectable is True
    assert rows["databricks/databricks-llama-4-maverick"].refusal == ""


async def test_serving_discovery_does_not_hide_a_gateway_row():
    store = MemoryRegistryStore()
    gateway = _gateway_spec()
    serving = _serving()
    await store.upsert_model(gateway)
    await store.upsert_model(serving)
    discovery = _Discovery([_serving("databricks-other")])
    catalogue = await ModelService(store, discovery, allow_external=True).catalogue("person")
    rows = {spec.id.value: spec for spec in catalogue.models}
    assert rows["gateway/gpt-5.6-terra"].state is ModelState.UNKNOWN
    assert rows["databricks/databricks-llama-4-maverick"].state is ModelState.NOT_SERVED


async def test_the_vault_reads_the_gateway_key_and_the_client_name(monkeypatch):
    monkeypatch.delenv("LLM_GATEWAY_KEY", raising=False)
    monkeypatch.delenv("XAIA_API_KEY", raising=False)
    vault = EnvVault({"XAIA_API_KEY": KEY})
    ref = await vault.find(ProviderKind.GATEWAY, user_id="person")
    assert ref is not None
    opened = await vault.open(ref.id, user_id="person")
    assert opened.value == KEY
    primary = EnvVault({"LLM_GATEWAY_KEY": "primary-fixture-gateway", "XAIA_API_KEY": KEY})
    opened = await primary.open(
        (await primary.find(ProviderKind.GATEWAY, user_id="person")).id, user_id="person",
    )
    assert opened.value == "primary-fixture-gateway"


async def test_resolution_uses_the_provider_key_variable(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", BASE)
    settings.cache_clear()
    store = MemoryRegistryStore()
    spec = _gateway_spec()
    await store.upsert_model(spec)
    catalogue = ModelService(store, None, allow_external=True)
    vault = EnvVault({"LLM_GATEWAY_KEY": KEY})
    credentials = CredentialService(vault, providers=adapter_for)
    resolver = ModelResolver(catalogue, credentials, providers=adapter_for, allow_external=True)
    resolved, secret = await resolver.resolve(spec.id.value, user_id="person", with_secret=True)
    assert resolved.env_var == "LLM_PROVIDER_KEY"
    assert resolved.credential_ref.startswith("env:")
    assert secret is not None and secret.value == KEY
    assert "DATABRICKS_TOKEN" not in resolved.env_var
    config = AgentConfig.from_resolved(resolved)
    written = config.as_opencode_json()
    block = written["provider"]["gateway"]
    assert block["npm"] == "@ai-sdk/azure"
    assert block["options"]["baseURL"] == f"{BASE}/openai"
    assert block["options"]["apiVersion"] == "2024-08-01-preview"
    assert block["options"]["apiKey"] == "{env:LLM_PROVIDER_KEY}"
    assert "temperature" not in written["provider"]["gateway"]["models"]["gpt-5.6-terra"]
    assert "attachment" not in written["provider"]["gateway"]["models"]["gpt-5.6-terra"]
    settings.cache_clear()


async def test_a_missing_key_does_not_post():
    store = MemoryRegistryStore()
    spec = _gateway_spec()
    await store.upsert_model(spec)

    class Boom:
        kind = ProviderKind.GATEWAY

        def probe(self, *args, **kwargs):
            raise AssertionError("posted")

    health = HealthService(store, CredentialService(EnvVault({}), providers=adapter_for), providers=lambda kind: Boom())
    state, detail = await health.probe(spec, user_id="person", force=True)
    assert state == "unauthorised"
    assert "key" in detail


async def test_xaia_base_url_is_used_when_the_app_setting_is_empty(monkeypatch):
    monkeypatch.delenv("APP_LLM_GATEWAY_BASE_URL", raising=False)
    monkeypatch.setenv("XAIA_BASE_URL", "https://xaia.example.com/root/")
    settings.cache_clear()
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    adapter = adapter_for(ProviderKind.GATEWAY)
    state, _detail = await adapter.probe(
        adapter.descriptor(_gateway_spec()),
        Secret(value=KEY, kind="api_key", ref="env:gateway"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    assert state == "available"
    assert seen == [
        "https://xaia.example.com/root/openai/deployments/gpt-5.6-terra/chat/completions"
        "?api-version=2024-08-01-preview"
    ]
    settings.cache_clear()


async def test_an_http_base_does_not_post(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", "http://insecure.example.com/xaia")
    monkeypatch.delenv("XAIA_BASE_URL", raising=False)
    settings.cache_clear()

    def refuse(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"posted to {request.url}")

    state, detail = await adapter_for(ProviderKind.GATEWAY).probe(
        adapter_for(ProviderKind.GATEWAY).descriptor(_gateway_spec()),
        Secret(value=KEY, kind="api_key", ref="env:gateway"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(refuse)),
    )
    assert state == "degraded"
    assert "https" in detail
    settings.cache_clear()


async def test_claude_posts_to_the_messages_url_without_temperature(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", "https://claude.example.com/xaia")
    settings.cache_clear()

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/xaia/anthropic/v1/messages"
        assert request.headers["api-key"] == KEY
        assert request.headers["anthropic-version"] == "2023-06-01"
        assert "authorization" not in {name.lower() for name in request.headers}
        body = json.loads(request.content)
        assert body["model"] == "claude-sonnet-5"
        assert body["max_tokens"] == 16
        assert "temperature" not in body
        assert "system" not in body
        return httpx.Response(200, json={
            "content": [{"type": "text", "text": "ok"}],
            "stop_reason": "end_turn",
        })

    spec = _gateway_spec("claude-sonnet-5", WireProtocol.GATEWAY_ANTHROPIC)
    state, detail = await adapter_for(ProviderKind.GATEWAY).probe(
        adapter_for(ProviderKind.GATEWAY).descriptor(spec),
        Secret(value=KEY, kind="api_key", ref="env:gateway"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    assert state == "available"
    assert detail == ""
    settings.cache_clear()


async def test_null_content_on_http_200_is_an_empty_answer(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", "https://think.example.com/xaia")
    settings.cache_clear()

    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "choices": [{"message": {"content": None}, "finish_reason": "length"}],
            "usage": {"completion_tokens_details": {"reasoning_tokens": 12}},
        })

    state, detail = await adapter_for(ProviderKind.GATEWAY).probe(
        adapter_for(ProviderKind.GATEWAY).descriptor(_gateway_spec("gpt-5.6-sol")),
        Secret(value=KEY, kind="api_key", ref="env:gateway"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    assert state == "available"
    assert detail == ""
    settings.cache_clear()


async def test_a_400_is_not_retried():
    seen = 0

    def handle(request: httpx.Request) -> httpx.Response:
        nonlocal seen
        seen += 1
        return httpx.Response(400, json={
            "error": {"code": "unsupported_value", "param": "temperature", "message": "unsupported"},
        })

    client = GatewayClient(
        "https://temp.example.com/xaia", KEY, max_retries=3, sleeper=_no_sleep,
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    response = await client.request("POST", chat_url("https://temp.example.com/xaia", "gpt-5.6-terra"))
    assert response.status_code == 400
    assert seen == 1
    state, _detail = _probe_state(response, "gpt-5.6-terra", client)
    assert state == "degraded"
    assert "gpt-5.6-terra" in client.reasoning


async def test_embeddings_return_the_vector_and_a_failure_returns_nothing(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", "https://embed.example.com/xaia")
    settings.cache_clear()
    secret = Secret(value=KEY, kind="api_key", ref="env:gateway")

    def ok(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/embeddings")
        assert b'"model"' in request.content
        return httpx.Response(200, json={"data": [{"embedding": [0.1, 0.2]}]})

    adapter = adapter_for(ProviderKind.GATEWAY)
    vector = await adapter.embed("hello", secret=secret, client=httpx.AsyncClient(transport=httpx.MockTransport(ok)))
    assert vector == [0.1, 0.2]

    def fail(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "down"})

    assert await adapter.embed(
        "hello", secret=secret, client=httpx.AsyncClient(transport=httpx.MockTransport(fail)),
    ) is None
    settings.cache_clear()


def test_the_deployments_list_uses_format_and_ignores_the_azure_data_key():
    from api.adapters.llm.providers.gateway import specs_from_deployments

    specs = specs_from_deployments({
        "data": [{"name": "from-data"}],
        "models": [
            {"name": "claude-sonnet-5", "format": "OpenAI", "capabilities": []},
            {"name": "text-embedding-3-large", "format": "OpenAI", "capabilities": ["embeddings"]},
        ],
    })
    by_name = {spec.endpoint: spec for spec in specs}
    assert "from-data" not in by_name
    assert by_name["claude-sonnet-5"].wire is WireProtocol.GATEWAY_OPENAI
    assert by_name["text-embedding-3-large"].wire is WireProtocol.GATEWAY_EMBED
    assert by_name["text-embedding-3-large"].capability.value == "chat_only"


async def test_a_configured_row_wins_and_an_empty_list_drops_only_discovered_rows():
    from dataclasses import replace

    store = MemoryRegistryStore()
    seed = _gateway_spec()
    await store.upsert_model(seed)
    discovered = replace(seed, display_name="from the list", origin="discovery")
    extra = replace(
        _gateway_spec("gpt-5.6-luna"),
        origin="discovery",
    )
    await store.upsert_model(extra)
    catalogue = await ModelService(
        store, None, allow_external=True, gateway_discovery=_ListDiscovery([discovered]),
    ).catalogue("person")
    rows = {spec.id.value: spec for spec in catalogue.models}
    assert rows["gateway/gpt-5.6-terra"].display_name == "gpt-5.6-terra"
    assert rows["gateway/gpt-5.6-luna"].state is ModelState.NOT_SERVED


async def test_the_claude_agent_block_uses_the_messages_prefix(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", BASE)
    settings.cache_clear()
    store = MemoryRegistryStore()
    spec = _gateway_spec("claude-sonnet-5", WireProtocol.GATEWAY_ANTHROPIC)
    await store.upsert_model(spec)
    resolver = ModelResolver(
        ModelService(store, None, allow_external=True),
        CredentialService(EnvVault({"LLM_GATEWAY_KEY": KEY}), providers=adapter_for),
        providers=adapter_for,
        allow_external=True,
    )
    resolved, _secret = await resolver.resolve(spec.id.value, user_id="person", with_secret=True)
    written = AgentConfig.from_resolved(resolved).as_opencode_json()
    block = written["provider"]["gateway-anthropic"]
    assert block["npm"] == "@ai-sdk/anthropic"
    assert block["options"]["baseURL"] == f"{BASE}/anthropic"
    assert block["options"]["headers"]["api-key"] == "{env:LLM_PROVIDER_KEY}"
    assert block["options"]["headers"]["anthropic-version"] == "2023-06-01"
    model = block["models"]["claude-sonnet-5"]
    assert model["options"]["toolStreaming"] is False
    assert "temperature" not in model
    assert "attachment" not in model
    settings.cache_clear()


async def test_app_prefixed_gateway_key_is_not_the_vault_name():
    vault = EnvVault({"APP_LLM_GATEWAY_KEY": KEY})
    assert await vault.find(ProviderKind.GATEWAY, user_id="person") is None


async def test_a_denied_deployments_list_leaves_the_seed(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", "https://denied.example.com/xaia")
    settings.cache_clear()
    store = MemoryRegistryStore()
    spec = _gateway_spec()
    await store.upsert_model(spec)

    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": "denied"})

    discovery = GatewayDiscovery(
        "https://denied.example.com/xaia", KEY,
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    catalogue = await ModelService(
        store, None, allow_external=True, gateway_discovery=discovery,
    ).catalogue("person")
    row = {item.id.value: item for item in catalogue.models}["gateway/gpt-5.6-terra"]
    assert row.state is ModelState.UNKNOWN
    assert row.origin == "seed"
    settings.cache_clear()


async def test_the_api_version_comes_from_the_app_setting(monkeypatch):
    monkeypatch.setenv("APP_LLM_GATEWAY_BASE_URL", "https://ver.example.com/xaia")
    monkeypatch.setenv("APP_LLM_GATEWAY_API_VERSION", "2025-01-01-preview")
    settings.cache_clear()
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    await adapter_for(ProviderKind.GATEWAY).probe(
        adapter_for(ProviderKind.GATEWAY).descriptor(_gateway_spec()),
        Secret(value=KEY, kind="api_key", ref="env:gateway"),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )
    assert seen[0].endswith("api-version=2025-01-01-preview")
    settings.cache_clear()


class _ListDiscovery:
    def __init__(self, specs) -> None:
        self._specs = specs

    async def fetch(self, token):
        return DiscoveryResult(tuple(self._specs), "ok")


def _gateway_spec(name: str = "gpt-5.6-terra", wire: WireProtocol = WireProtocol.GATEWAY_OPENAI):
    from api.domain.llm import Capability, ModelSpec
    from api.domain.llm.limits import LimitEvidence, Limits

    return ModelSpec(
        id=ModelId(ProviderKind.GATEWAY, name),
        display_name=name,
        provider_name="Generic AI Gateway",
        wire=wire,
        endpoint=name,
        limits=Limits(64_000, 8192, LimitEvidence.DOCUMENTED, "test"),
        capability=Capability.TOOLS,
        credential_kind=CredentialKind.API_KEY,
        group="Generic AI Gateway",
    )


def _serving(name: str = "databricks-llama-4-maverick"):
    from api.domain.llm import Capability, ModelSpec
    from api.domain.llm.limits import LimitEvidence, Limits

    return ModelSpec(
        id=ModelId(ProviderKind.DATABRICKS, name),
        display_name=name,
        provider_name="Databricks AI Gateway",
        wire=WireProtocol.SERVING,
        endpoint=name,
        limits=Limits(128_000, 8000, LimitEvidence.MEASURED, "test"),
        capability=Capability.TOOLS,
        credential_kind=CredentialKind.NONE,
        state=ModelState.AVAILABLE,
    )


class _Discovery:
    def __init__(self, specs) -> None:
        self._specs = specs

    async def fetch(self, token):
        return DiscoveryResult(tuple(self._specs), "ok")
