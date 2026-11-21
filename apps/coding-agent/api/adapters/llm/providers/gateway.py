"""Generic AI Gateway: Azure API Management, header `api-key`, deployments URLs.

The serving adapter is a different host and a different header. This module does not
call it and does not send `DATABRICKS_TOKEN`.

The subscription key comes from the vault (`LLM_GATEWAY_KEY`, or `XAIA_API_KEY`).
The base URL comes from `APP_LLM_GATEWAY_BASE_URL`, or from `XAIA_BASE_URL` when
the setting is empty.
A missing base is a configuration error. No production host is filled in.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field, replace
from typing import Any, Awaitable, Callable

import httpx

from ....config import settings
from ....domain.llm import ModelSpec, ProviderKind, WireProtocol
from ....ports import ProviderDescriptor, Secret
from .base import PROVIDER_KEY_ENV, BaseAdapter

API_VERSION = "2024-08-01-preview"
CHAT_TIMEOUT = 180.0
EMBED_TIMEOUT = 30.0
MAX_RETRIES = 3
RETRYABLE = frozenset({429, 500, 502, 503, 504})
REASONING_MODELS = frozenset({"o3", "o3-mini", "gpt-5.5", "gpt-5.6-sol"})
ANTHROPIC_VERSION = "2023-06-01"
EMBED_DEPLOYMENT = "text-embedding-3-large"
EXPECTED_EMBED_DIMS = 3072

Sleeper = Callable[[float], Awaitable[None]]


def configured_base(explicit: str = "") -> str:
    """The gateway root, without a trailing slash. Empty when nothing is configured."""
    raw = (explicit or settings().llm_gateway_base_url or os.environ.get("XAIA_BASE_URL") or "").strip()
    if not raw or raw.lower().startswith("http://"):
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"
    return raw.rstrip("/")


def configured_key(explicit: str = "") -> str:
    if explicit:
        return explicit.strip()
    return (os.environ.get("LLM_GATEWAY_KEY") or os.environ.get("XAIA_API_KEY") or "").strip()


def api_version() -> str:
    return settings().llm_gateway_api_version or API_VERSION


def chat_url(base: str, deployment: str, version: str | None = None) -> str:
    return (
        f"{base.rstrip('/')}/openai/deployments/{deployment}"
        f"/chat/completions?api-version={version or api_version()}"
    )


def anthropic_url(base: str) -> str:
    return f"{base.rstrip('/')}/anthropic/v1/messages"


def deployments_url(base: str, version: str | None = None) -> str:
    return f"{base.rstrip('/')}/deployments?api-version={version or api_version()}"


def embed_url(base: str, deployment: str = EMBED_DEPLOYMENT, version: str | None = None) -> str:
    return (
        f"{base.rstrip('/')}/openai/deployments/{deployment}"
        f"/embeddings?api-version={version or api_version()}"
    )


def api_headers(key: str, *, anthropic: bool = False) -> dict[str, str]:
    headers = {"api-key": key, "Content-Type": "application/json"}
    if anthropic:
        headers["anthropic-version"] = ANTHROPIC_VERSION
    return headers


def chat_body(
    messages: list[dict],
    max_tokens: int,
    deployment: str,
    *,
    temperature: float | None = None,
    reasoning_effort: str | None = None,
    response_format: dict | None = None,
    stream: bool = False,
    reasoning: frozenset[str] = REASONING_MODELS,
) -> dict[str, Any]:
    """OpenAI-shaped body. The deployment is in the path, so `model` is absent."""
    body: dict[str, Any] = {"messages": messages, "max_completion_tokens": max_tokens}
    if response_format:
        body["response_format"] = response_format
    if reasoning_effort and deployment in reasoning:
        body["reasoning_effort"] = reasoning_effort
    if temperature is not None and deployment not in reasoning:
        body["temperature"] = temperature
    if stream:
        body["stream"] = True
        body["stream_options"] = {"include_usage": True}
    return body


def anthropic_body(messages: list[dict], model: str, max_tokens: int, *, stream: bool = False) -> dict[str, Any]:
    system_parts = [m.get("content", "") for m in messages if m.get("role") == "system"]
    chat = [{"role": m["role"], "content": m.get("content", "")} for m in messages if m.get("role") != "system"]
    body: dict[str, Any] = {"model": model, "max_tokens": max_tokens, "messages": chat}
    if system_parts:
        body["system"] = "\n\n".join(system_parts)
    if stream:
        body["stream"] = True
    return body


def temperature_rejected(status: int, payload: Any) -> bool:
    if status != 400 or not isinstance(payload, dict):
        return False
    err = payload.get("error") or {}
    if isinstance(err, dict) and err.get("code") == "unsupported_value" and err.get("param") == "temperature":
        return True
    text = json.dumps(payload).lower()
    return "temperature is deprecated" in text or "unsupported_value" in text and "temperature" in text


def make_strict_schema(schema: dict) -> dict:
    """Azure strict mode: every object closed, every property required, maps as key/value arrays."""
    import copy

    schema = copy.deepcopy(schema)

    def is_map(node: Any) -> bool:
        return (
            isinstance(node, dict)
            and node.get("type") == "object"
            and not node.get("properties")
            and isinstance(node.get("additionalProperties"), dict)
        )

    def patch(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if is_map(node):
            value_schema = node.pop("additionalProperties")
            description = node.get("description", "")
            node.clear()
            node.update({
                "type": "array",
                "description": (description + " " if description else "") + "Encoded as a list of {key, value} entries.",
                "items": {
                    "type": "object",
                    "properties": {"key": {"type": "string"}, "value": value_schema},
                    "required": ["key", "value"],
                    "additionalProperties": False,
                },
            })
        for value in list(node.values()):
            if isinstance(value, dict):
                patch(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        patch(item)
        if node.get("type") == "object" or "properties" in node:
            node["additionalProperties"] = False
            props = node.get("properties") or {}
            if props:
                node["required"] = list(props.keys())

    patch(schema)
    return schema


def decode_maps(data: Any, original: Any) -> Any:
    """Turn `{key, value}` arrays back into dicts, walking the schema from before the patch."""
    if isinstance(original, dict) and original.get("type") == "object" and not original.get("properties"):
        if isinstance(original.get("additionalProperties"), dict) and isinstance(data, list):
            return {
                item.get("key"): decode_maps(item.get("value"), original["additionalProperties"])
                for item in data
                if isinstance(item, dict)
            }
    if isinstance(data, dict) and isinstance(original, dict) and original.get("properties"):
        return {
            key: decode_maps(value, (original.get("properties") or {}).get(key, {}))
            for key, value in data.items()
        }
    return data


def parse_sse(text: str) -> tuple[str, dict]:
    """Join `delta.content`. A usage chunk may have no `choices`. `[DONE]` ends the stream."""
    parts: list[str] = []
    usage: dict = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("data:"):
            continue
        payload = stripped[5:].strip()
        if payload == "[DONE]":
            break
        try:
            body = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(body.get("usage"), dict):
            usage = body["usage"]
        choices = body.get("choices") or []
        if choices:
            delta = choices[0].get("delta") or {}
            content = delta.get("content")
            if content:
                parts.append(content)
    return "".join(parts), usage


class CircuitBreaker:
    """Five exhausted calls open the breaker for 60 seconds. Then one call is allowed."""

    def __init__(self, threshold: int = 5, cooldown: float = 60.0, clock=time.monotonic) -> None:
        self._threshold = threshold
        self._cooldown = cooldown
        self._clock = clock
        self.failures = 0
        self._open_until = 0.0
        self._half_open = False

    def allow(self) -> bool:
        if self.failures < self._threshold:
            return True
        if self._clock() < self._open_until:
            return False
        if self._half_open:
            return False
        self._half_open = True
        return True

    def success(self) -> None:
        self.failures = 0
        self._half_open = False
        self._open_until = 0.0

    def failure(self) -> None:
        self.failures += 1
        self._half_open = False
        if self.failures >= self._threshold:
            self._open_until = self._clock() + self._cooldown


@dataclass
class GatewayClient:
    """The HTTP client. Tests pass a transport and a sleeper so retries do not wait."""

    base_url: str
    api_key: str
    version: str = API_VERSION
    timeout: float = CHAT_TIMEOUT
    max_retries: int = MAX_RETRIES
    breaker: CircuitBreaker = field(default_factory=CircuitBreaker)
    reasoning: set[str] = field(default_factory=lambda: set(REASONING_MODELS))
    sleeper: Sleeper | None = None
    client: httpx.AsyncClient | None = None
    json_schema_retired: bool = False
    calls: list[httpx.Request] = field(default_factory=list)

    def _http(self) -> tuple[httpx.AsyncClient, bool]:
        if self.client is not None:
            return self.client, False
        return httpx.AsyncClient(timeout=self.timeout), True

    async def _sleep(self, seconds: float) -> None:
        if self.sleeper is not None:
            await self.sleeper(seconds)
            return
        import asyncio
        await asyncio.sleep(seconds)

    async def request(
        self,
        method: str,
        url: str,
        *,
        json_body: dict | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> httpx.Response:
        if not self.breaker.allow():
            raise CircuitOpen("The gateway is paused after repeated failures. Wait a minute and try again.")
        own = False
        http, own = self._http()
        sent_headers = headers or api_headers(self.api_key)
        try:
            last: httpx.Response | None = None
            for attempt in range(self.max_retries + 1):
                response = await http.request(
                    method, url, json=json_body, headers=sent_headers, timeout=timeout or self.timeout,
                )
                self.calls.append(response.request)
                if response.status_code in RETRYABLE and attempt < self.max_retries:
                    last = response
                    await self._sleep(2 * (2 ** attempt))
                    continue
                if response.status_code in RETRYABLE:
                    self.breaker.failure()
                elif response.status_code < 300:
                    self.breaker.success()
                last = response
                return response
            assert last is not None
            return last
        except httpx.HTTPError:
            self.breaker.failure()
            raise
        finally:
            if own:
                await http.aclose()


class CircuitOpen(RuntimeError):
    """The breaker is open. The caller must not open a socket."""


_BREAKERS: dict[str, CircuitBreaker] = {}


def breaker_for(base: str) -> CircuitBreaker:
    return _BREAKERS.setdefault(base, CircuitBreaker())


def _json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except json.JSONDecodeError:
        return {"text": response.text}


class GatewayAdapter(BaseAdapter):
    kind = ProviderKind.GATEWAY
    wire = WireProtocol.GATEWAY_OPENAI
    npm = "@ai-sdk/azure"
    bearer = False

    def __init__(self) -> None:
        self.reasoning: set[str] = set(REASONING_MODELS)
        self.json_schema_retired = False

    def base_url(self, spec: ModelSpec, *, host: str = "", project: str = "") -> str:
        base = configured_base()
        if not base:
            return ""
        if spec.wire is WireProtocol.GATEWAY_ANTHROPIC:
            return f"{base}/anthropic"
        if spec.wire is WireProtocol.GATEWAY_EMBED:
            return f"{base}/openai/deployments/{spec.endpoint}"
        return f"{base}/openai"

    def tool_streaming(self, spec: ModelSpec) -> bool:
        return spec.wire is not WireProtocol.GATEWAY_ANTHROPIC

    def headers(self, spec: ModelSpec) -> dict[str, str]:
        if spec.wire is WireProtocol.GATEWAY_ANTHROPIC:
            return {
                "api-key": f"{{env:{PROVIDER_KEY_ENV}}}",
                "anthropic-version": ANTHROPIC_VERSION,
            }
        return {}

    def extra_body(self, spec: ModelSpec) -> dict[str, Any]:
        if spec.wire is WireProtocol.GATEWAY_OPENAI:
            return {"apiVersion": api_version()}
        return {}

    def descriptor(self, spec: ModelSpec, *, host: str = "", project: str = "") -> ProviderDescriptor:
        desc = super().descriptor(spec, host=host, project=project)
        if spec.wire is WireProtocol.GATEWAY_ANTHROPIC:
            npm = "@ai-sdk/anthropic"
        elif spec.wire is WireProtocol.GATEWAY_EMBED:
            npm = ""
        else:
            npm = "@ai-sdk/azure"
        return replace(desc, npm=npm)

    def auth_headers(self, secret: Secret | None) -> dict[str, str]:
        if secret is None or not secret.value:
            return {}
        return api_headers(secret.value)

    async def probe(self, desc: ProviderDescriptor, secret: Secret | None,
                    *, client: httpx.AsyncClient | None = None) -> tuple[str, str]:
        if secret is None or not getattr(secret, "value", ""):
            return "unauthorised", "Generic AI Gateway needs a key before this model can run."
        base = configured_base()
        if not base:
            raw = (settings().llm_gateway_base_url or os.environ.get("XAIA_BASE_URL") or "").strip()
            if raw.lower().startswith("http://"):
                return "degraded", "The gateway base URL must be https."
            return "degraded", "Generic AI Gateway has no base URL. Set APP_LLM_GATEWAY_BASE_URL."
        wire = desc.wire
        deployment = desc.model_key
        gateway = GatewayClient(
            base, secret.value, client=client, max_retries=0, timeout=CHAT_TIMEOUT,
            reasoning=self.reasoning, breaker=breaker_for(base),
        )
        try:
            if wire is WireProtocol.GATEWAY_ANTHROPIC:
                response = await gateway.request(
                    "POST",
                    anthropic_url(base),
                    json_body=anthropic_body(
                        [{"role": "user", "content": "ok"}], deployment, 16,
                    ),
                    headers=api_headers(secret.value, anthropic=True),
                )
            elif wire is WireProtocol.GATEWAY_EMBED:
                response = await gateway.request(
                    "POST",
                    embed_url(base, deployment),
                    json_body={"input": "ok", "model": deployment},
                    headers=api_headers(secret.value),
                    timeout=EMBED_TIMEOUT,
                )
            else:
                response = await gateway.request(
                    "POST",
                    chat_url(base, deployment),
                    json_body=chat_body(
                        [{"role": "user", "content": "ok"}], 16, deployment, reasoning=gateway.reasoning,
                    ),
                    headers=api_headers(secret.value),
                )
        except CircuitOpen as exc:
            return "degraded", str(exc)
        except httpx.HTTPError as exc:
            return "degraded", f"{type(exc).__name__}"
        return _probe_state(response, deployment, gateway)

    async def embed(self, text: str, *, secret: Secret | None,
                    deployment: str = EMBED_DEPLOYMENT,
                    client: httpx.AsyncClient | None = None) -> list | None:
        """One embedding. A failure returns nothing. A short or long vector is still returned."""
        if secret is None or not secret.value:
            return None
        base = configured_base()
        if not base:
            return None
        gateway = GatewayClient(
            base, secret.value, client=client, max_retries=0, timeout=EMBED_TIMEOUT,
            breaker=breaker_for(base),
        )
        try:
            response = await gateway.request(
                "POST",
                embed_url(base, deployment),
                json_body={"input": text, "model": deployment},
                headers=api_headers(secret.value),
                timeout=EMBED_TIMEOUT,
            )
        except (CircuitOpen, httpx.HTTPError):
            return None
        if response.status_code >= 400:
            return None
        return embedding_vector(_json(response))


def _probe_state(response: httpx.Response, deployment: str, gateway: GatewayClient) -> tuple[str, str]:
    payload = _json(response)
    if response.status_code == 405:
        return "unauthorised", f"This key cannot call {deployment}."
    if response.status_code in (401, 403):
        return "unauthorised", "The provider refused the key. Replace it to use this model."
    if temperature_rejected(response.status_code, payload):
        gateway.reasoning.add(deployment)
        return "degraded", "This deployment rejects temperature. The next call omits it."
    if response.status_code >= 400:
        return "degraded", str(payload)[:400]
    if isinstance(payload, dict):
        choices = payload.get("choices") or []
        if choices:
            message = choices[0].get("message") or {}
            if message.get("content") is None:
                return "available", ""
    return "available", ""


def embedding_vector(payload: Any) -> list | None:
    """The first embedding, or nothing. A missing vector is not replaced with a guess."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        return None
    vector = data[0].get("embedding")
    if not isinstance(vector, list) or not vector:
        return None
    return vector


def specs_from_deployments(body: dict) -> list[ModelSpec]:
    """Turn `{"models":[...]}` into catalogue rows. `data` is the Azure shape and is ignored."""
    from ....domain.llm import Capability, CredentialKind, ModelId
    from ....domain.llm.limits import LimitEvidence, Limits

    rows = body.get("models")
    if not isinstance(rows, list):
        return []
    specs: list[ModelSpec] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("id") or "").strip()
        if not name:
            continue
        caps = {str(c).lower() for c in (item.get("capabilities") or [])}
        fmt = str(item.get("format") or "")
        wire = _wire(name, fmt, caps)
        capability = Capability.CHAT_ONLY if wire is WireProtocol.GATEWAY_EMBED else (
            Capability.TOOLS_AND_REASONING if "reasoning" in caps or name in REASONING_MODELS
            else Capability.TOOLS
        )
        specs.append(ModelSpec(
            id=ModelId(ProviderKind.GATEWAY, name.lower()),
            display_name=str(item.get("model_name") or name),
            provider_name="Generic AI Gateway",
            wire=wire,
            endpoint=name,
            limits=Limits(
                64_000, 8192, LimitEvidence.DOCUMENTED,
                "LLMConfig.max_completion_tokens; context window was not named by the client",
            ),
            capability=capability,
            credential_kind=CredentialKind.API_KEY,
            group="Generic AI Gateway",
            origin="discovery",
            sees_images=False,
        ))
    return specs


def _wire(name: str, fmt: str, caps: set[str]) -> WireProtocol:
    if "embeddings" in caps or "embedding" in name.lower():
        return WireProtocol.GATEWAY_EMBED
    if fmt:
        return WireProtocol.GATEWAY_ANTHROPIC if fmt.lower() == "anthropic" else WireProtocol.GATEWAY_OPENAI
    if name.lower().startswith("claude"):
        return WireProtocol.GATEWAY_ANTHROPIC
    return WireProtocol.GATEWAY_OPENAI
