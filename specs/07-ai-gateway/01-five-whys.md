# 01 — Five whys, then first principles

[Index](README.md) · next: [02 Code grounding](02-code-grounding.md)

The question this specification answers: what must EdgeGenie send, and what must it
never send, to be compatible with the Generic AI Gateway.

## Five whys

**1. Why does a turn fail even when a model name looks right?**
Because the process that speaks to the model is given a base URL and a model key,
and those two strings choose the door. A plausible key on the wrong door is a 404
or an empty spinner, not a typo the user can see. The first deployment offered an
endpoint the workspace did not serve (`apps/coding-agent/api/adapters/databricks/serving.py`).

**2. Why do two "gateway" names in this repository produce different requests?**
Because one name is a display string and the other is a path. The seed calls the
Databricks provider "Databricks AI Gateway" while `DatabricksAdapter` sets
`GATEWAY_PATH = "/serving-endpoints"`. The captures that exercised the Generic AI
Gateway use `/ai-gateway/openai/v1`. The words match. The bytes do not.
Citations are in [02](02-code-grounding.md#two-doors).

**3. Why can the existing adapter not be retargeted?**
Because that adapter is the golden file for exam comparability. Its module says a
one-byte change makes later exam results incomparable
(`apps/coding-agent/api/adapters/llm/providers/databricks.py`). Compatibility is a
second provider, not a flag inside the first.

**4. Why can a gateway model not be stored as `databricks/system.ai.<name>`?**
Because `ModelId.parse` consults `ALIASES` before it accepts an id, and those
entries rewrite `databricks/system.ai.*` into serving-endpoint ids
(`apps/coding-agent/api/domain/llm/model.py`). A gateway row that used the existing
prefix would be sent to Model Serving under a different name. The rewrite is
correct for the old door and fatal for the new one.

**5. Why is a wrong output number worse than an unknown number?**
Because the app asks for `max_tokens` on the call, and the door rejects a value
above that model's cap only after the user has waited. The error text names the
cap. A number we invent and mark as measured will be sent again. An explicit
default that is below every cap this repository has recorded still runs
(`apps/coding-agent/api/domain/llm/limits.py`).

The fifth answer is the rule for every other field: a captured byte is a fact, a
comment that cites a document is a claim, and a missing capture is unknown.

## First principles

These are constraints. A design that needs one of them relaxed is a different
product and belongs in a decision, not in an implementation shortcut.

| Id | Principle | What it forces |
|---|---|---|
| P1 | The wire is the path, the method, the headers, and the body keys. A display name is not a wire. | [03](03-protocol.md) is normative. [07](07-ux-wireframes.md) may shorten a label and may not change a path. |
| P2 | One door, one model-key grammar. | Serving keys stay `databricks-<name>`. Gateway keys stay `system.ai.<name>`. No function derives one from the other. |
| P3 | An id resolves through a table. | The new prefix is `gateway/`. It is absent from `ALIASES`. Adding a rewrite later is a table edit plus a test, not string surgery. |
| P4 | A secret is a value in the child environment. A URL is configuration. | `opencode.json` stores `{env:DATABRICKS_TOKEN}`. The host is normalised once. The token is never a column and never a log line. |
| P5 | Unknown JSON keys are a client defect. | The measured door answers `400` with `json: unknown field`. The client strips only the prefix it has captured (`__copilot`). It does not strip-and-retry arbitrary keys. |
| P6 | A cap moves down, never up, and only from the provider's own number. | `cap_from_error` already implements the direction. The gateway provider uses it. It does not copy the serving row's output. |
| P7 | Unreadable is not empty. | Discovery that fails returns a named outcome and does not delete catalogue rows. The gateway has no captured list API, so its catalogue is the seed plus probes, not a guess from `/api/2.0/serving-endpoints`. |
| P8 | Health is an observation with a time. Copy tells the user the action that observation supports. | "Not enabled" names an account admin. "Not served" names the model id. "Unauthorised" names the token or the scope. A `PERMISSION_DENIED` that says the model is no longer available is not an auth failure. |
| P9 | The model provider does not call tools. | MCP on the same host is a second port. Sharing a token helper is allowed. Sharing a class that both chats and calls tools is not. |
| P10 | The serving golden file is an invariant of this work. | Phases in [10](10-implementation-plan.md) that touch `DatabricksAdapter` or `opencode.databricks.golden.json` have failed. |

## What "compatible" means

A session is compatible when all of the following hold, and not before:

1. The request URL is one of the four paths in [03](03-protocol.md#doors).
2. The body contains only keys that door has accepted in a capture or in the
   client this repository already configures for that door.
3. The model key is the Unity Catalog name, unchanged.
4. The output limit sent is less than or equal to a measured cap, or equal to the
   conservative default when no cap was measured.
5. A second turn of a tool call still parses, for the OpenAI door. The Gemini
   native door is not offered for tools until a capture shows a second turn.
6. A refusal is classified by the phrase table in [03](03-protocol.md#refusals)
   and the picker shows the sentence in [07](07-ux-wireframes.md#copy).

Compatibility is not "the same display name as the serving models" and not
"HTTP 200 from any Databricks path".
