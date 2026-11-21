# 08 — Lenses

[Index](README.md) · prev: [07 UX wireframes](07-ux-wireframes.md) · next: [09 Edge cases](09-edge-cases.md)

Each lens reads the same code. A lens that needs a fact [02](02-code-grounding.md)
does not contain is marked unknown there, not discovered here.

## Product owner

The job is a session that reaches the model the captures reached, under the
name a person can distinguish from Model Serving.

Shipped value, in order:

1. OpenAI door with the four seed ids, correct ceilings, and a refusal that
   says what to do next.
2. Anthropic door visible and not selectable until a probe succeeds.
3. The serving picker left exactly as it is, including image-capable rows.

Deferred, with the reason a customer can be told: Gemini tool loops, skills,
and any model id that was not in a capture. MCP tools are a separate capability
the app already covers with its own fenced server. Offering the gateway's SQL
and sandbox MCP in the same session would create a second way to run SQL and a
second way to run code. That is a product decision, and [10](10-implementation-plan.md)
puts it behind an explicit phase rather than inside the model provider.

Success is GW-01 through GW-18 passing, plus an empty diff on the serving golden
file. Success is not a count of models.

## Full stack developer

The change is one adapter, one kind, three wire values, one prefix in
`agent_prefix`, one label branch, one seed block, one golden file, and phrase
rules that are tried before the rules they would otherwise shadow.

The resolver, `ProviderBlock`, `Grant`, `clamp`, `cap_from_error`, `useful_text`,
and `may_use` stay. A gateway `if` inside `DatabricksAdapter` is the defect this
plan is written to prevent. The web client renders `refusal` and `group`. It
does not grow a gateway component.

The child process is still the agent that reads `opencode.json`. EdgeGenie does
not gain an HTTP chat implementation of its own. The probe is the only request
the app process sends to the model door.

## Database expert

No new table. The provider row's `base_url` is null so a workspace move does
not require an update. `extra_options` holds paths and the operator string, and
the existing `provider_no_key` check remains the tripwire for a secret.

Evidence is one column. The source string records that context and output do
not share a measurement. Splitting the column would rewrite every provider for
a caveat the source string can carry. Health is append-only and capped at 400
characters. Caps move only downward, in the same transaction as the health
insert, so a reader never sees a new ceiling without the error that named it.

Grants stay default-open. A gateway-specific allow-list would lock every user
out on the day the rows appear, which is the failure `Grant.allows` documents
for the current product.

The discovery table is not given a fake `ok` row. Absence of a run is the
truthful state.

## UX and UI

Two groups, two subtitles, one sentence per failure, sent by the server. The
selectable control and the refused row are the same component. Refused rows
remain in the tab order. `Send` carries the refusal in its accessible name when
it is inactive. Limits that are `default` say they are assumed. Image controls
do not appear for these rows.

The layout in [07](07-ux-wireframes.md) is the composer plus the existing model
dialog. No new route.

## AI engineer

The compatible chat path is OpenAI Chat Completions through
`@ai-sdk/openai-compatible`, with `max_tokens` clamped per model. Tool streaming
stays on for that door because the captured failure was Anthropic's, not this
one. Anthropic on this gateway uses `@ai-sdk/anthropic` with `toolStreaming`
false and both the bearer header and the api key set to the workspace token.

Gemini 3.x tool use is a protocol problem, not a prompt problem: the second
turn must echo `thought_signature`. This client cannot, on the evidence in
§4.7. The provider refuses the door instead of shipping a shim inside the
session. A shim that stores signatures is a second place a payload lives, and
the experiment that proved it was a local proxy, not this app.

Reasoning flags are not copied from serving gpt-oss. Tool use is the capability
that was observed. A silent upgrade to `tools_and_reasoning` would tell the
agent to spend output on a channel this door has not been shown to return.

The strict decoder means a client "extra" used for tracing will break the next
turn, which is the Copilot failure mode: the first call works, the post-tool
call carries a private field, and the door returns 400. The strip is limited
to the captured prefix so a future private field fails loudly.

## System design

```text
browser
  -> app (resolve, grants, clamp, write opencode.json, start child)
       -> agent process (npm client, Door G)
            -> Generic AI Gateway  /ai-gateway/openai/v1
       -> fenced tool server (existing)
            -> workspace APIs

Door S remains:
  app -> agent process -> {host}/serving-endpoints/{name}/chat/completions
```

Trust boundary: the token crosses into the child environment and into the
`Authorization` header. It does not cross into the agent file, the database, or
the transcript. The gateway sees the user token, so Unity Catalog grants on any
MCP tool are the caller's grants. That is why MCP is not silently added to
every session: it would be a second privileged client.

Failure isolation: a Gemini protocol error does not flip the OpenAI row.
An MCP transport error does not flip a model row. A serving discovery failure
does not flip a gateway row.

The app process's only model request is a one-token probe, 12 second budget,
the same `PROBE_TIMEOUT` the other adapters use. Chat time stays on the child,
which already has the long budget.

## Cost and o(n)

The work a request may do is fixed, not proportional to the catalogue.

| Step | Bound |
|---|---|
| Resolve one id | one map lookup, one alias check, no scan of models |
| Clamp | arithmetic on two integers |
| Strip `__copilot` | one walk of the probe object. The probe has three keys. A body the size of a transcript is not stripped in the app, because the app does not send it. The child must not add those keys. The golden file has none. |
| Probe | one POST, one model, not the whole catalogue, and only when the picker is opened and that row's health is older than the existing 300 second TTL |
| Cap parse | three regular expressions, already compiled, one string capped at the detail that `useful_text` returns |
| Phrase classify | a fixed list of patterns, first match returns |
| MCP list | one POST per service the session configured, not per model |

What this forbids:

- Probing every gateway model on every chat message.
- Reading `/api/2.0/serving-endpoints` to decide gateway health.
- Retrying a strict-body 400.
- A per-token scan of the workspace token to "validate" it. Presence and the
  door's 401 are enough. `token_scopes` already runs on workspace refusals
  inside `DbxHttp` and logs scope names, not the token.

Catalogue size is the seed, five rows. Rendering the picker is linear in the
rows the user is allowed to see, which is the current client. This provider
does not add a nested group per wire. One group, five radios.
