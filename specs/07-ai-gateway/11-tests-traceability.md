# 11 — Tests and traceability

[Index](README.md) · prev: [10 Implementation plan](10-implementation-plan.md)

The client build is tested by T-19 through T-30 in
[10](10-implementation-plan.md#exit-gate) and [12](12-client-wire.md#tests-to-add).
T-01 through T-18 and scenarios S1 through S16 below certify the withdrawn
Databricks bearer door. Run T-01 anyway: it is the hash of the serving files.
Do not treat S1's path `/ai-gateway/openai/v1/chat/completions` as the client.

Tests are local. They use a fake HTTP server. They do not call a workspace and
they do not need a token.

## Test groups

| Id | Covers | What it asserts |
|---|---|---|
| T-01 | GW-11, E-02 | Hash of `providers/databricks.py` probe and base URL behavior, and of `opencode.databricks.golden.json`, matches the pre-change file. The test stores the hash in the test, not a comment. |
| T-02 | GW-03, E-01, E-18 | `ModelId.parse` of the serving alias and of `gateway/system.ai.gpt-oss-120b`. Injectivity: no alias value equals a `gateway/` id. |
| T-03 | GW-05, GW-06, E-03, E-10, E-11, E-12 | Probe JSON object equals the fixture. A nested `__copilotMessageSource` is absent. A key `note` is still present, proving the strip is not "delete unknown". A 400 `unknown field` does not produce a second request. |
| T-04 | GW-07, E-04, E-27 | Errors naming 8192, 10000, and 25000 lower a higher stored cap. An error naming 0, a number above context, or a number above the stored cap does not write. The turn function is invoked once. |
| T-05 | E-05, E-06, E-15 | Seed gateway gpt-oss output is 25000 and serving gpt-oss output is 24000. Llama gateway output is 8192 and serving llama output is 8000. `gpt-oss-20b` is the default pair. No id contains `gemini`. |
| T-06 | GW-09, E-08, E-09, E-30, E-36 | Phrase table on the six captured sentences. Existing parametrized classify cases still return their original cause. A detail containing a fake token is redacted before it would be stored. |
| T-07 | GW-01, GW-04, E-13, E-21, E-22, E-23, E-31, E-35 | Golden agent files. `http://` refused. Bare host becomes `https`. Anthropic file has both credential templates and `toolStreaming: false`. Block name `gateway`. `base_url` of the provider row is null; the resolved URL uses the host argument. |
| T-08 | GW-14, E-14 | `sees_images` false. `model_entry` output has no `attachment` and no `modalities`. |
| T-09 | GW-12, GW-16, GW-17, E-16, E-19, E-20 | Claude with `not_enabled` is not selectable and `may_use` returns `DENY_NOT_SELECTABLE`. `secret is None` does not call the transport. A 403 body that names scopes becomes the scope sentence, not an empty model list. |
| T-10 | GW-08, E-17, E-28 | A serving discovery `denied` leaves gateway row count unchanged. Two probes inside 300 seconds produce one POST. A `denied` probe is followed by another POST. |
| T-11 | GW-10, E-24, E-25, E-26 | MCP client: first body method is `tools/list`; last `data: ` line wins; `isError` does not call the health writer; chat adapter source has no `tools/call`. |
| T-12 | GW-09, E-07 | Picker payload `refusal` equals the sentence table for each state. The client test reads `refusal` and does not contain a second copy of the admin sentence. The limits payload includes `source`. |
| T-13 | E-29, E-32 | User deny beats group allow, via `Grant.allows`, on a gateway id. `custom_model` raises `InvalidModel` for kind `gateway`. |
| T-14 | E-33, E-34 | Stall text does not change model state from `available` and does not call the transport again. A retryable probe runs at most twice. |
| T-15 | GW-18 | Turn row has provider `gateway`, wire, endpoint, evidence, and credential ref `workspace-token`. The serialized turn dict has no field whose value contains the test token. |
| T-16 | GW-02 | Endpoint missing `system.ai.` is rejected at seed load. Endpoint with a space is rejected. The HTTP model field equals the endpoint. |
| T-17 | GW-19, E-37 | `allow_external=False`: a gateway row stays selectable; an OpenAI row is refused with the existing "disabled" sentence. `is_workspace_native` is true for `DATABRICKS`, `FAKE`, and `GATEWAY` only. `uses_workspace_token` is true for `DATABRICKS` and `GATEWAY` only. |
| T-18 | GW-21, E-39, E-40 | Resolved `env_var` is `""`. `env_for` does not call the vault. The health probe's recorded secret provider is `databricks`, and a probe with a token performs one POST. |

## Requirement coverage

| Requirement | Tests |
|---|---|
| GW-01 | T-07 |
| GW-02 | T-16 |
| GW-03 | T-02 |
| GW-04 | T-07, T-15 |
| GW-05 | T-03 |
| GW-06 | T-03 |
| GW-07 | T-04, T-05 |
| GW-08 | T-10 |
| GW-09 | T-06, T-12 |
| GW-10 | T-11 |
| GW-11 | T-01 |
| GW-12 | T-09 |
| GW-13 | T-05 |
| GW-14 | T-08 |
| GW-15 | T-07 |
| GW-16 | T-09 |
| GW-17 | T-09 |
| GW-18 | T-15 |
| GW-19 | T-17 |
| GW-20 | T-10 |
| GW-21 | T-18 |
| GW-22 | T-12 |

## Risk coverage

E-01 through E-42 are each named in [09](09-edge-cases.md#register) with a test
group. T-01 through T-18 are those groups. A new risk is a new row in that
register and a new assertion, not a comment in a test.

## End to end

One process-local server implements Door G and nothing else. The suite points
the gateway adapter at it by passing `host`. Production host logic is not
special-cased; the fake host is a normal https URL the test terminates with its
own certificate or, if the stack cannot, the test calls the adapter with a
transport double that records the URL. The second option is the unit form.
The end-to-end form is the local server, because only a server can prove the
bytes on the wire.

Scenarios, each a separate test, run in order by a person only in the sense
that the file lists them. They do not share mutable catalogue rows.

| Scenario | Arrange | Act | Assert |
|---|---|---|---|
| S1 Happy probe | Server accepts the exact body and returns 200 | Probe `system.ai.gpt-oss-120b` | One POST, path `/ai-gateway/openai/v1/chat/completions`, body equals the fixture, state `available` |
| S2 Strict field | Server returns 400 `json: unknown field "trace"` if `trace` is present, else 200 | Probe a body that the strip function was given with a nested `__copilot` key and no other extra | 200, and the server saw no `__copilot` key |
| S3 Extra field is a defect | Client under test is given a probe builder that adds `trace`, standing in for a regression | Probe | 400, one POST, state `degraded`, cause `protocol_error` |
| S4 Cap | Server returns the llama sentence when `max_tokens` > 8192 | Resolve llama and probe with a stored cap of 9000 | Stored cap becomes 8192, one health row, no second chat POST |
| S5 Wrong name | Server returns `ENDPOINT_NOT_FOUND` for `system.ai.claude-sonnet-4-5` | Probe | `not_served`, not selectable, no alias rewrite |
| S6 Not enabled | Server returns `MODEL is not enabled` | Probe Claude | `not_enabled`, admin sentence, `Send` inactive in the client test |
| S7 Bad token shape | Server returns 401 `permission denied` without "no longer available" | Probe | `unauthorised`, catalogue length unchanged |
| S8 Misleading deny | Server returns the Anthropic "no longer available" sentence with HTTP 403 | Probe | `not_served`, not `unauthorised` |
| S9 Anthropic file | Build `AgentConfig` for the Claude row | Write the file | Equals `opencode.gateway.anthropic.golden.json` |
| S10 OpenAI file | Build `AgentConfig` for gpt-oss | Write the file | Equals `opencode.gateway.golden.json`, and the file does not contain the characters of the test token |
| S11 Serving untouched | Run S1 | Compare Door S golden | Unchanged |
| S12 MCP | Server wraps `tools/list` in `data: ` | `list_tools("system.ai.dbsql")` | Method is `tools/list`, params `{}`, no `initialize`, model health table unchanged |
| S13 Image | Payload with `seesImages: false` | Client composer with an attachment | The attachment is not added to the outgoing prompt. The refusal sentence is the image sentence. |
| S14 Picker | Seed both providers | Render groups | "Generic AI Gateway" and "Databricks · AI Gateway" both present. Two llama labels, two different ids. |
| S15 Grant | User deny row | `may_use` | `not_granted`, no POST |
| S16 Stall | Child result is empty and the fake chat returned 200 earlier | Record the turn | Model state still `available`, no further POST |

S13 is a client test with a fixture payload, not a browser session, unless the
work is being done in a tree that already runs the composer in a browser harness.
When a browser harness exists, S14 and S13 are also clicked: open Change, move
focus onto the refused Claude row, confirm the previous model is still selected,
and confirm Send's accessible name. When no harness is running, the component
test is the verification and the plan says so in the test output.

## Client tests

These are the exit gate in [10](10-implementation-plan.md#exit-gate). The
assertions for T-19 through T-24 are in [12](12-client-wire.md#tests-to-add).

| Id | Roadblocks | Assert |
|---|---|---|
| T-25 | R1, R2 | `llm_allow_external` false: a gateway row stays listed, `selectable` is false, refusal is the existing "external providers are disabled" sentence. A Databricks row stays selectable. The allow tuples in the resolver and in `_decorate` do not contain `GATEWAY` |
| T-26 | R3, R4, R13, R14, R27 | Resolved `env_var` is `LLM_PROVIDER_KEY`. `env_for` opens the vault and does not send the workspace token as `api-key`. A missing vault row probes as `unauthorised` with no POST. An empty base URL does not POST. The fixture key is not a string from the 17 Nov 2026 tree |
| T-27 | R6, R7, R26 | The OpenAI-shaped agent block has npm `@ai-sdk/azure`, `baseURL` ending in `/openai`, `apiVersion` `2024-08-01-preview`, and no `temperature`. The Anthropic block has `toolStreaming: false` and header `api-key`. Neither entry has `attachment` or `modalities`. The serving golden file is byte-identical |
| T-28 | R8, R9 | After a serving discovery that lists one endpoint, `gateway/gpt-5.6-terra` is unchanged and the serving id absent from that list is `not_served`. `ModelId.parse("databricks/system.ai.gpt-oss-120b")` still returns the serving endpoint id. `gateway/gpt-5.6-sol` is not an alias target |
| T-29 | R11, R12 | Picker order is "Databricks · AI Gateway", then "Generic AI Gateway". The gateway tag is `catalog`. The seed default id is `google_vertex/google/gemini-3.8-flash`. Gateway output is 8192 |
| T-30 | R24 | An embedding response of length 3072 is stored. A different length is stored and recorded as a warning. A failed call stores no vector and counts toward the chat breaker |

## What is not a test

- A live call to `*.cloud.databricks.com`.
- A screenshot of the picker as proof of the URL.
- A test that only asserts the display name contains "Gateway".
- Editing an old classify fixture so the new rule looks green.
