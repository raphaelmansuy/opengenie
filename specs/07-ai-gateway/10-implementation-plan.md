# 10 — Implementation plan

[Index](README.md) · prev: [09 Edge cases](09-edge-cases.md) · next: [11 Tests](11-tests-traceability.md)

Build the provider in [12](12-client-wire.md). The serving adapter, the serving
golden file, and the product default stay as they are. Each phase below is one
reviewable change. A phase is done when its roadblocks are closed by a test,
not when the file compiles.

The earlier draft of this file walked a Databricks bearer door
(`/ai-gateway/openai/v1`, workspace token, `credential_kind: none`). Those
steps are withdrawn. They are roadblock R1. Do not reintroduce them.

## Roadblocks

Each row is a seam in the current OpenGenie code, or a byte the 17 Nov 2026
client sends. The mitigation is the behavior the phase must land. The test is
the proof.

| Id | Seam | What fails if the seam is ignored | Mitigation | Phase | Test |
|---|---|---|---|---|---|
| R1 | Withdrawn Databricks steps: add `GATEWAY` to a workspace-native allow-list, `credential_kind: none`, probe with `DATABRICKS_TOKEN` | The host receives a bearer token on a URL it does not serve | Follow the phases in this file. The kind stays external. The header is `api-key` | all | T-19, T-25 |
| R2 | `ModelResolver.resolve` and `ModelService._decorate` allow only `DATABRICKS` and `FAKE` when `llm_allow_external` is false (`config.py` default) | A gateway row looks selectable, or a "fix" that adds `GATEWAY` to those tuples turns external providers on for this host | Leave both tuples as they are. The row stays in the catalogue. `refusal` is the existing sentence, and `ModelSpec.selectable` is false while `refusal` is set | P1 | T-25 |
| R3 | `CredentialService.env_for` returns after writing `DATABRICKS_TOKEN` when `env_var` is empty. `AgentConfig.from_resolved` substitutes `DATABRICKS_TOKEN` when `env_var` is empty | An empty env var sends the workspace token and never opens the vault | `credential_kind` is `api_key`. The adapter's `env_var` is `LLM_PROVIDER_KEY`. The resolver copies it because the kind is not `none` | P1 | T-26 |
| R4 | `HealthService.probe` opens a vault key only when `credential_kind` is not `none`. The `none` branch calls `open_for(DATABRICKS)` | `open_for(GATEWAY)` with no row marks the model unauthorised, which is correct for a missing key. Calling `open_for(DATABRICKS)` sends the workspace token | Leave that branch. A gateway row uses `find` and `open_ref` on kind `gateway`. `secret is None` returns `unauthorised` and does not POST | P5 | T-26 |
| R5 | `BaseAdapter.auth_headers`: `bearer` true sends `Authorization: Bearer`; `bearer` false sends `x-api-key` | Either header is the wrong name. `AnthropicAdapter` also sends `x-api-key` | The gateway adapter overrides `auth_headers`. The probe sends `api-key` and `Content-Type` only. `BaseAdapter._post` and `AnthropicAdapter` stay unchanged | P2 | T-19, T-20 |
| R6 | `ProviderBlock.as_dict` always sets `options.apiKey`. `@ai-sdk/openai-compatible` posts `{baseURL}/chat/completions` with `Authorization: Bearer` and a body `model` field | That URL is not `{base}/openai/deployments/{deployment}/chat/completions`, and the body key the client sends is `max_completion_tokens` | The app's HTTP client is the wire: path, query `api-version=2024-08-01-preview`, header `api-key`, body `messages` and `max_completion_tokens`. The agent file uses `@ai-sdk/azure`, `baseURL` `{base}/openai`, and `apiVersion` `2024-08-01-preview`. `apiVersion` is emitted only when set, so the serving golden file gains no key. The agent path is unfinished until a recorded request matches T-19 | P2, P3 | T-19, T-27 |
| R7 | `@ai-sdk/anthropic` posts with `x-api-key`. The client posts `{base}/anthropic/v1/messages` with `api-key` and `anthropic-version: 2023-06-01`, and omits `temperature` | A Claude turn 400s, or it authenticates as a different product | The app client builds that URL and those headers. `system` is a top-level string. The agent block sets `toolStreaming: false`. The agent Claude path stays unfinished until a recorded request matches T-20 | P2, P3 | T-20 |
| R8 | Serving discovery marks every `databricks` id absent from `/api/2.0/serving-endpoints` as `not_served`. `build_registry` holds one discovery object | Kind `databricks` hides the rows after the first refresh. Replacing that object with a gateway list marks every serving model `not_served` | Kind is `gateway`. Serving discovery stays the object it is. Gateway discovery upserts only `gateway` ids and never supplies the seen-set used for serving | P4 | T-28 |
| R9 | `ALIASES` rewrites `databricks/system.ai.*` to serving endpoint ids. `ModelId.parse` lowercases the model name | A catalogue id becomes a serving endpoint. A mixed-case deployment name is stored as a different id from the path | Ids are `gateway/` plus the deployment name. No new alias. Deployment names in the seed are already lowercase, which is the stored form | P1 | T-28 |
| R10 | `custom_model` rejects every kind outside `EXTERNAL`, and the message names Databricks discovery | Adding the kind to `EXTERNAL` lets an admin type `gpt-5.5`. Routing discovery through `custom_model` rejects a legitimate row | Do not edit `custom_model`. Discovery constructs `ModelSpec` directly. A test still expects `InvalidModel` for kind `gateway` | P4 | T-20 |
| R11 | `GROUP_RANK` places an unknown group after "Not available here". `providerTag` maps `databricks` to the word `gateway` and falls through to the raw provider string otherwise | The new rows sort last, and both doors show the same tag | Seed `group: Generic AI Gateway`. Insert that name at index 1. Map provider `gateway` to the tag `catalog` | P4 | T-29 |
| R12 | Seed load keeps the last `default: true`. With none set, the first model becomes the default. An omitted `output` is stored as 4000 | The product default moves off `google_vertex/google/gemini-3.8-flash`, or the cap is the seed fallback | No gateway row sets `default`. Rows are appended. Each row sets `output: 8192`, evidence `documented`, source `LLMConfig.max_completion_tokens`. Context is 64000 with source "the client did not name a context window". Do not copy serving caps 24000 or 8000 | P4 | T-29 |
| R13 | `OpenAIAdapter.base_url` falls back to `https://api.openai.com/v1`. The client falls back from env to yaml to a hardcoded production table. `provider_https` rejects a non-https base | A missing setting silently calls the public API or the production host. An `http://` base sends the key in clear text | One setting, `llm_gateway_base_url`. Empty means a configuration error and no POST. No hardcoded host. `http://` is refused before the POST | P2 | T-26 |
| R14 | `config/agent.yaml` and the hardcoded key table in the download contain live subscription keys | The key lands in the repo, the golden file, or a test | Those files are not read. The vault, `LLM_GATEWAY_KEY`, or `XAIA_API_KEY` is the only source. Tests use a fixture key that is not a value from that tree | P2 | T-26 |
| R15 | `LLMConfig.default_model` is `gpt-5.5`. The door answers 405. `BaseAdapter._post` maps only 401 and 403 to `unauthorised`; 405 falls through to `classify` | The retired deployment is seeded, and a 405 looks like a dead gateway | Do not seed `gpt-5.5`. The gateway probe maps 405 to `unauthorised` with `This key cannot call {deployment}.` A 400 or 405 does not call `record_failure` | P2, P4 | T-20, T-22 |
| R16 | The client's circuit breaker opens after 5 exhausted calls and then allows one probe when 60 seconds have passed. `HealthService` already waits `llm_probe_seconds` (default 900) | A second cache double-counts, or chat ignores the open circuit and keeps posting. The client's embedding call does not use the breaker | The breaker lives in the gateway client, keyed by base URL. Five exhausted retryable calls open it. The next call raises before a socket. One call is allowed after 60 seconds. Health keeps its own interval. Embeddings use this same breaker | P2, P5 | T-22 |
| R17 | Retryable statuses are 429, 500, 502, 503, 504, three retries, backoff `2 * 2^attempt`, timeout 180 seconds. `PROBE_TIMEOUT` is 12 seconds | A reasoning model is marked degraded because the shared probe gave up at 12 seconds, or a 400 is retried with the same body | Chat and the gateway probe use 180 seconds. They do not use `PROBE_TIMEOUT`. 401, 403, 405, and 400 are not retried. Serving probes stay on 12 seconds because `BaseAdapter` is unchanged | P2 | T-22 |
| R18 | Reasoning deployments (`o3`, `o3-mini`, `gpt-5.5`, `gpt-5.6-sol`, plus any deployment that returned 400 `error.code=unsupported_value` and `error.param=temperature`) reject `temperature`. Claude returns 400 "temperature is deprecated". `llm_tool.py` sets `temperature: 1` | The turn fails, and a retry sends the same body | Omit `temperature` unless the caller set it and the deployment is outside the reasoning set. Omit it always for Anthropic. A 400 of that shape adds the deployment to the set and is not retried. Follow `call_llm_ex`, not `llm_tool.py` | P2 | T-20 |
| R19 | A thinking model can return `content: null` with `reasoning_tokens` set | The probe treats an empty answer as a transport failure and marks the model degraded | That response is an empty answer. State stays `available` when the HTTP status is 200 | P2 | T-24 |
| R20 | Strict `json_schema` requires `additionalProperties: false` and every property in `required`. A 400 or 422 retires `json_schema` for the process. Free-form maps are `[{key, value}]` | The first structured call fails closed, or a map is sent as an open object | Patch the schema before send. On 400 or 422, the next call uses `{"type":"json_object"}` and unwraps one wrapper key. Decode the array back to a dict | P2 | T-23 |
| R21 | Stream usage can arrive in a chunk with empty `choices`, then `data: [DONE]` | The parser drops the usage or waits forever | Keep the usage. `[DONE]` ends the stream. Content is `choices[0].delta.content` | P2 | T-24 |
| R22 | `GET {base}/openai/models` is 404 on this host. The list body is `{"models":[...]}`, not `{"data":[...]}` | Discovery stores nothing, or it stores the Azure shape and the catalogue stays empty | `GET {base}/deployments?api-version=2024-08-01-preview`. Read `models`. Do not call `/openai/models`. `embeddings` capability is not a chat row. `reasoning` capability means no temperature | P4 | T-21 |
| R23 | Configured rows and the live list disagree. A denial returns no list. An empty 200 is empty | A 403 wipes the seed, or an empty 200 deletes `gpt-5.6-sol` | On the same deployment name, the configured row wins. A denial or a transport error leaves configured rows. An empty 200 removes only rows that discovery itself had added. Seed rows stay | P4 | T-21 |
| R24 | Embedding URL is the deployments path, expected length 3072, timeout 30 seconds. A failure returns no vector | A wrong-length vector is invented, or embeddings keep calling a dead host | Return the vector even when the length is not 3072, and record the warning. On failure, store no vector. The call takes the chat breaker | P5 | T-30 |
| R25 | C-2 forbids a string comparison with `"databricks"`, `"openai"`, `"anthropic"`, or `"google_vertex"` in `services/` | A new `== "gateway"` branch in the resolver looks like the way to special-case the token | Compare `ProviderKind` members. The gateway adapter owns the URL and the header. `services/` gains no vendor string | P1 | existing C-2 test |
| R26 | `sees_images` defaults false. Declaring it true makes the agent send `image_url` | A picture is sent to a deployment this client never showed accepting one | Leave `sees_images` false. The agent entry omits `attachment` and `modalities` | P3 | T-27 |
| R27 | `provider_no_key` rejects a provider row whose options contain `sk-` | A pasted subscription key fails the insert, or worse, matches and gets stored | The provider row holds the base URL only. The key stays in the vault | P4 | T-26 |

## Phases

### P0 — Fixtures against the client wire

Add `apps/coding-agent/tests/fixtures/gateway/` with the chat request, the
Anthropic request, the deployments list, the SSE stream, and the refusal
sentences from [12](12-client-wire.md). No adapter yet.

Exit: a reviewer can diff each fixture against [12](12-client-wire.md) and find
no extra key. The fixtures do not contain a host from the download and do not
contain a key.

Closes the oracle for R5, R6, R7, R14.

### P1 — Kind, wires, credential fact

- `ProviderKind.GATEWAY = "gateway"`.
- `WireProtocol.GATEWAY_OPENAI`, `GATEWAY_ANTHROPIC`, `GATEWAY_EMBED`.
- `agent_prefix` returns `gateway` for the OpenAI-shaped wire and
  `gateway-anthropic` for the Anthropic wire. One kind, two blocks, same
  pattern Vertex already uses for its two wires.
- Register one adapter class so `adapter_for` stops raising `KeyError`.
- Do not add the kind to the `allow_external` tuples (R2).
- Do not add `is_workspace_native` or `uses_workspace_token`.
- Credential on the seed shape is `api_key`, variable `LLM_PROVIDER_KEY` (R3).
- Do not edit `custom_model` (R10).

Exit: existing alias tests stay green. C-2 stays green (R25). T-25 fails until
P4 seeds a row, so this phase asserts the predicates with a constructed spec:
external off, gateway refused, OpenAI refused, Databricks still resolved.

### P2 — The HTTP client

New module `api/adapters/llm/providers/gateway.py`. It builds every URL the
client builds. It does not subclass the serving URL.

| Call | Request |
|---|---|
| Chat | `POST {base}/openai/deployments/{deployment}/chat/completions?api-version=2024-08-01-preview` |
| Claude | `POST {base}/anthropic/v1/messages` |
| List | `GET {base}/deployments?api-version=2024-08-01-preview` |
| Embed | `POST {base}/openai/deployments/text-embedding-3-large/embeddings?api-version=2024-08-01-preview` |

Header on every call: `api-key`. Claude also sends `anthropic-version: 2023-06-01`.
No `Authorization`. No `x-api-key` (R5, R7).

Chat body keys are `messages` and `max_completion_tokens`. Claude body keys are
`model`, `max_tokens`, `messages`, and `system` when the caller passed one.
Temperature follows R18. `reasoning_effort` is sent only when the caller set it
and the deployment is in the reasoning set.

Empty `llm_gateway_base_url` returns a configuration error and does not POST
(R13). The client does not read the download (R14).

Retry, timeout, and the breaker follow R16 and R17. 405 follows R15. A null
`content` on HTTP 200 follows R19. Structured output follows R20. The stream
parser follows R21.

`auth_headers` is overridden on this class. `BaseAdapter._post` is not edited,
so serving's 401 shortcut stays.

Exit: T-19, T-20, T-22, T-23, T-24. `git diff` on `providers/databricks.py` and
`opencode.databricks.golden.json` is empty.

### P3 — Agent file, unfinished until a recorded request

`ProviderBlock` gains an optional `apiVersion`, written only when it is set.
The serving golden file has no such key, so its bytes stay put (R6).

OpenAI-shaped block:

- npm `@ai-sdk/azure`
- `baseURL` `{base}/openai`
- `apiVersion` `2024-08-01-preview`
- `apiKey` `{env:LLM_PROVIDER_KEY}`
- model key is the deployment name
- no `temperature`
- no `attachment`, no `modalities` (R26)

Anthropic block:

- npm `@ai-sdk/anthropic`
- `baseURL` `{base}/anthropic`
- header `api-key` templated as `{env:LLM_PROVIDER_KEY}`
- header `anthropic-version` value `2023-06-01`
- `toolStreaming: false`
- no `temperature`

The golden files lock that JSON. They do not prove the agent process emits the
client's URL. P3 records the gap: T-27 compares the file. A later capture
compares the request the agent actually sends with T-19 and T-20. Until that
capture, the app client from P2 is the only path allowed to call the host.
Do not point `@ai-sdk/openai-compatible` at `{base}/openai/deployments`.

Exit: T-27. Serving golden hash unchanged.

### P4 — Seed, picker, discovery beside serving

Provider row: kind `gateway`, base URL empty in the seed (the setting supplies
it), credential `api_key`, no secret in `extra_options` (R27).

Model rows, appended, none with `default: true` (R12):

| Id | Deployment | Wire | Notes |
|---|---|---|---|
| `gateway/gpt-5.6-sol` | `gpt-5.6-sol` | `gateway_openai` | reasoning, no temperature |
| `gateway/gpt-5.6-terra` | `gpt-5.6-terra` | `gateway_openai` | |
| `gateway/gpt-5.6-luna` | `gpt-5.6-luna` | `gateway_openai` | |
| `gateway/claude-sonnet-5` | `claude-sonnet-5` | `gateway_anthropic` | |
| `gateway/text-embedding-3-large` | `text-embedding-3-large` | `gateway_embed` | not a chat row |

`gpt-5.5` is absent (R15). Output 8192 documented. Context 64000 with the
source in R12. `sees_images` false.

Picker: group name at index 1 of `GROUP_RANK`, tag `catalog` (R11).

Discovery is a second reader. `build_registry` keeps `DatabricksDiscovery`
(R8). The gateway reader sends the vault key, calls `GET /deployments`, and
reads `models` (R22, R23). It does not receive `DATABRICKS_TOKEN`. A serving
refresh does not change a `gateway` row's state.

Exit: T-21, T-25, T-28, T-29. The seeded default id is still
`google_vertex/google/gemini-3.8-flash`.

### P5 — Health and embeddings

Health uses the existing non-`none` credential branch (R4). Missing key: state
`unauthorised`, no POST. Probe timeout 180 seconds, body
`max_completion_tokens` small enough for a liveness call, same keys as chat.
405 uses the sentence in R15. The breaker is the one from P2 (R16).

Embeddings use the URL in R24 and the same breaker. A failure writes no vector.

`HealthService`'s 900 second interval stays. It is not a second breaker.

Exit: T-26, T-30.

## File targets

| File | Phase | Change |
|---|---|---|
| `api/domain/llm/model.py` | P1 | kind, three wires, prefix |
| `api/adapters/llm/providers/__init__.py` | P1 | register the adapter |
| `api/adapters/llm/providers/gateway.py` | P2 | URLs, header, retry, breaker |
| `api/config.py` | P2 | `llm_gateway_base_url`, empty default |
| `api/domain/llm/agent_config.py` | P3 | optional `apiVersion`; display name |
| `web/src/domain/models.ts` | P4 | group rank, tag `catalog` |
| `seed/llm_models.yaml` | P4 | provider and five rows, no `default` |
| `api/composition/model_registry.py` | P4 | second discovery reader |
| `api/services/health_service.py` | P5 | no new branch; the `api_key` branch already opens the vault |

Files that stay byte-identical: `providers/databricks.py`,
`discovery/databricks.py`, `providers/base.py`, `providers/anthropic.py`,
`opencode.databricks.golden.json`, `001_llm_schema.sql`, `domain/llm/custom.py`.

`model_resolver.py` and `model_service.py` stay free of a new allow-list entry.
Their current external check is the mitigation for R2.

## Exit gate

1. T-19 through T-30 pass, and the existing C-2 test passes.
2. The serving golden file's hash is unchanged.
3. A local server accepts the chat fixture and rejects `Authorization`,
   `max_tokens` on the OpenAI-shaped door, a body `model` field on that door,
   and `temperature` on `gpt-5.6-sol` and on `claude-sonnet-5`.
4. With `llm_allow_external` false, a gateway row has `selectable` false and
   the existing disabled sentence. A Databricks row is unchanged.
5. The agent-file golden exists, and the note on P3 still says the agent
   process is unverified until a recorded request matches T-19 and T-20.

[11](11-tests-traceability.md) groups T-01 through T-18 and scenarios S1 through
S16 belong to the withdrawn Databricks door. They are not this exit gate.
T-01 remains worth running: it is the hash of the serving files.

## Rollback

Set the provider row `enabled = false`. `ModelSpec.selectable` requires
`enabled`, so the rows leave the choosable set. Serving rows are a different
provider id and stay. Leave the enum value in place while stored ids exist.
`ModelId.parse` would otherwise reject those ids and the composer would show
the existing unknown-model sentence. Rewriting them into serving ids is not
part of rollback.
