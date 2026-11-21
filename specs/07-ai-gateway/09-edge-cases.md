# 09 — Edge cases

[Index](README.md) · prev: [08 Lenses](08-lenses.md) · next: [10 Implementation plan](10-implementation-plan.md)

Each row is a failure that can actually happen given the captures, the current
classifier, or the alias table. The mitigation is the behavior. The test column
points at [11](11-tests-traceability.md). A row without a test is not done.

## Register

| Id | Situation | What goes wrong if ignored | Mitigation | Test |
|---|---|---|---|---|
| E-01 | Catalogue id uses `databricks/system.ai.*` | `ALIASES` rewrites it to a serving endpoint and the request hits Door S | Prefix `gateway/`. No new alias. Parse test asserts both ids. | T-02 |
| E-02 | Adapter base URL is switched in `DatabricksAdapter` | Serving golden file moves; exam comparisons break | New class. Diff of `databricks.py` and the serving golden file is empty. | T-01 |
| E-03 | Probe body includes `stream`, `user`, or a trace id | Door returns `json: unknown field` | Exact three keys. Contract test loads the body. | T-03 |
| E-04 | `max_tokens` equals the named ceiling and the door rejects it, or a later error names a lower ceiling | The next turn repeats the bad number | Store a lower positive cap only. Do not retry the turn. | T-04 |
| E-05 | Serving output 24000 or 8000 is copied onto the gateway twin | gpt-oss may ask for less than the door allows, or llama may ask for a number that was only a serving choice and is then labelled measured for the wrong door | Seed table in [05](05-data-model.md#seed-rows) is the only source. A test compares the two rows and expects them to differ. | T-05 |
| E-06 | `gpt-oss-20b` given the 120b ceiling | A request above the real cap fails after the user waits | Default 4000 / 64000 until an error names a ceiling. | T-05 |
| E-07 | Context 128000 marked `measured` | The UI claims a measurement §3.2 does not contain | `limit_source` names the template and the error. UI shows the source. | T-12 |
| E-08 | Body is `PERMISSION_DENIED` plus `no longer available` | Current rule 7 classifies it as a bad token | Phrase rule 4 wins. Gateway probe classifies the body before the 401 shortcut. `BaseAdapter._post` unchanged. | T-06 |
| E-09 | Body is `ENDPOINT_NOT_FOUND` | `classify` returns `unknown`, and the picker offers the model as unchecked | Rule 4 sets `not_served`, which is not selectable. | T-06 |
| E-10 | Body is `json: unknown field "__copilotMessageSource"` | Client retries, or strips every unknown key and hides the next defect | Strip that prefix before send only. A 400 after that is `protocol_error` and the last request. | T-03 |
| E-11 | First Copilot-shaped call has no private field; the post-tool call does | The session dies on turn two, which is the captured failure | The child config has no such field. The app does not send the transcript. A fixture of a two-level dict still strips only that prefix. | T-03 |
| E-12 | `__copilot` nested inside a list inside a message | A shallow delete leaves the key | Strip walks dicts and lists, as the shim does. Strings are not scanned. | T-03 |
| E-13 | Host is a bare hostname, or has a trailing slash | The URL is `host/ai-gateway` without a scheme, or a double slash that still works on some servers and fails a golden comparison | `normalize_host` once. Golden file uses `https://h.example.com/ai-gateway/openai/v1`. | T-07 |
| E-14 | `sees_images` copied from the serving llama row | The agent sends `image_url`. No capture shows the door accepts it. | False, and the agent entry omits `attachment` and `modalities`. Composer keeps the image and says so. | T-08 |
| E-15 | Gemini row offered because the family is famous | Second tool turn 400s, or the id is invented | No seed row. No radio. | T-05 |
| E-16 | Claude offered as selectable while the probe says not enabled | The user waits for a turn that cannot start | `not_enabled` is not selectable. `Send` is inactive. The admin sentence is shown. | T-09 |
| E-17 | Serving list returns 403 | Gateway rows are deleted because "discovery failed" | Gateway catalogue does not read that endpoint. | T-10 |
| E-18 | Serving list returns the foundation name | Someone inserts `system.ai.*` as a serving endpoint | Discovery already stores `endpoint=name`, not the foundation name. A regression test keeps that. Gateway ids are a different kind, so a foundation string cannot collide. | T-02 |
| E-19 | Empty token | Probe posts `Bearer ` or the child starts and spins | Probe returns `unauthorised` without a POST, the same early return `DatabricksAdapter.probe` uses when `secret is None`. | T-09 |
| E-20 | Token lacks scope `ai-gateway` | User is told they lack access to a table, or the catalogue goes empty | `ScopeMissing` when the client is `DbxHttp`. Probe detail keeps the platform sentence. Catalogue rows stay. | T-09 |
| E-21 | `http://` host | Token sent in clear text | `normalize_host` will prefix `https://` only when the scheme is absent. An explicit `http://` is refused before the POST. The provider-row check already forbids storing one. | T-07 |
| E-22 | Anthropic `toolStreaming` left at the default true | Tool calls arrive in a shape the mapper drops | Adapter returns false for that wire. Golden file contains `"toolStreaming": false`. | T-07 |
| E-23 | Anthropic config sets `apiKey` and forgets `Authorization`, or the reverse | The captured config sets both to the workspace token. Either omission is an untested door. | Golden file has both, same env template. | T-07 |
| E-24 | MCP `isError` marks the chat model degraded, or a chat 400 disables SQL | One door's failure poisons the other | Separate classes. Health updates take a model id. MCP errors do not carry one. | T-11 |
| E-25 | SSE `data:` line is not unwrapped | `json.loads` runs on `event: message` and the tool looks down | Last `data: ` line, as `dbx_mcp.py` does. A body with two data lines uses the last. A body with none is parsed whole. | T-11 |
| E-26 | `initialize` added "because MCP always needs it" | A behavior the captured client did not need, and a second round trip on every list | Not sent. A test asserts the first method is `tools/list`. | T-11 |
| E-27 | Cap named in the error is 0 or larger than context | The row violates `max_output <= context_window` or stores 0 | Ignore the number. Append health. Leave the stored cap. | T-04 |
| E-28 | Two probes in the same TTL | A picker refresh storms the door | Reuse the 300 second cache `DatabricksDiscovery` uses, per model id, in the gateway health reader. A denial is not cached, so a fixed scope is visible on the next attempt. | T-10 |
| E-29 | User deny and group allow | The open default or the group wins | `Grant.allows` already lets an explicit user deny win. Gateway grants use that function unchanged. | T-13 |
| E-30 | Detail contains the token or `sk-` | `llm_health.detail` becomes a secret store | `redact` then truncate to 400, the path `_detail` already uses. | T-06 |
| E-31 | Agent block name `dbx` for a gateway model | One block, two key grammars, golden files ambiguous | Block `gateway`. `agent_prefix` test. | T-07 |
| E-32 | Hand-typed endpoint in the admin form | A row that fails on first send, the case `custom_model` already forbids for Databricks | `custom_model` rejects kind `gateway`. | T-13 |
| E-33 | Stall after several tool calls, HTTP 200 | A retry loop resends the same prompt, which the measurement said was deterministic | Do not retry. Model stays `available`. Copy from [07](07-ux-wireframes.md#copy). | T-14 |
| E-34 | Rate limit, then a second rate limit | The "once" retry becomes a loop | One retry for the probe only. A turn is not retried. The second probe failure stays `degraded` and `retryable` is not acted on again. | T-14 |
| E-35 | Workspace host changes between sessions | A base URL frozen in `llm_provider.base_url` keeps the old host | Column stays null. Base is computed from the current host. | T-07 |
| E-36 | `INVALID_STATE` without `MODEL is not enabled` | A new rule swallows a serving fixture that expected `not_enabled` from the old pattern | Old pattern stays. New tests only add sentences. Existing parametrized cases are not edited. | T-06 |
| E-37 | `llm_allow_external` is false, the production default | Resolver raises `NotSelectable` ("external providers are disabled") and the catalogue sets that refusal. The new rows look broken on day one | `is_workspace_native` includes `GATEWAY` beside `DATABRICKS` and `FAKE`. OpenAI still gets the refusal. | T-17 |
| E-38 | New models use kind `databricks` so they "just work" | Serving discovery sets every Databricks id that is absent from `/api/2.0/serving-endpoints` to `not_served`. A UC name is absent, so every gateway row becomes unselectable after the first successful discovery | Kind stays `gateway`. The discovery loop is not widened. A test discovers a serving name and asserts the gateway row's state is unchanged. | T-10 |
| E-39 | `GatewayAdapter.env_var` is copied onto `ResolvedModel` | Resolver only copies `env_var` when `credential_kind` is not `none`. If a later edit copies it anyway, `env_for` calls `open_ref` and raises `NoCredential` | Credential stays `none`. A test asserts the resolved `env_var` is `""` and `env_for` returns only `DATABRICKS_TOKEN` from the workspace token argument, with no vault read. | T-18 |
| E-40 | Health probe uses `open_for(GATEWAY)` or passes `secret=None` | `None` makes the probe return unauthorised without a POST, and every gateway row is marked unauthorised | The probe loads the token with `open_for(ProviderKind.DATABRICKS)`, the same branch serving models use. | T-18 |
| E-41 | Group name omitted from `GROUP_RANK`, or the tag falls through to `spec.provider` | The new group sorts after "Not available here". Both doors show the tag `gateway` | Rank index 1. Tag `catalog`. Existing group remains index 0. | T-12 |
| E-42 | A gateway seed row sets `default: true`, or is the first row and the gemini default is removed | `load()` keeps the last `default: true`. The product default would move off `google_vertex/google/gemini-3.8-flash` | No gateway row sets `default`. Rows are appended. A test reads the seed and expects the same default id as before the rows existed. | T-05 |

## State coverage

The charts in [06](06-statecharts.md) are exhaustive for the transitions the
provider may take. In particular:

- no edge from a strict-body 400 back to send;
- no edge from MCP `tool_err` to model `degraded`;
- no edge from serving discovery to a gateway insert or delete;
- `unknown` may be selected; `not_enabled` and `not_served` may not;
- a downward cap does not replay the turn.

[11](11-tests-traceability.md) names the test that walks each of those edges.
