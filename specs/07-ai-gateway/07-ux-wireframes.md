# 07 — UX wireframes

[Index](README.md) · prev: [06 Statecharts](06-statecharts.md) · next: [08 Lenses](08-lenses.md)

The picker already groups models and refuses the ones that are not selectable
(`ModelSpec.selectable`, `policy.may_use`). This provider adds a group and a
set of sentences. It does not add a screen. Copy is specified here so the client
and the server cannot each invent a sentence (GW-09).

## Navigation

```text
+------------------------------------------------------------------+
|  OpenGenie                                                        |
+------------------+-----------------------------------------------+
|  Conversations   |  Composer                                     |
|                  |                                               |
|  New             |  Model: gpt-oss-120b                          |
|                  |         Generic AI Gateway            [Change]|
|                  |                                               |
|                  |  +------------------------------------------+ |
|                  |  |  message                                 | |
|                  |  +------------------------------------------+ |
+------------------+-----------------------------------------------+
        |
        | Change
        v
+------------------------------------------------------------------+
|  Choose a model                                            [Close]|
+------------------------------------------------------------------+
|  Databricks · AI Gateway                                          |
|    ( ) llama-4-maverick        serving endpoint · images          |
|                                                                  |
|  Generic AI Gateway                                               |
|    ( ) gpt-oss-120b            ready · tools · output 25000       |
|    ( ) qwen3-next-80b          ready · tools · output 10000       |
|    ( ) llama-4-maverick        ready · tools · output 8192        |
|    ( ) gpt-oss-20b             assumed limits · output 4000       |
|    ( ) claude-sonnet-4-5       not enabled here                   |
+------------------------------------------------------------------+
```

The two llama rows are different doors. The subtitle is the group name, not a
shared id. Selecting one must not resolve to the other (GW-03).

The existing group stays first. `GROUP_RANK` in `web/src/domain/models.ts`
places any unknown group name after "Not available here", so the new name is
inserted at index 1, immediately after `Databricks · AI Gateway`. The row tag
for provider `databricks` is already the word `gateway`. The new kind must not
reuse that tag. Its tag is `catalog`, because the model key is a Unity Catalog
name. `providerTag` gets an explicit entry. The fallback `spec.provider` would
print `gateway` and the two doors would look the same (GW-22).

Narrow width, the same list, stacked. The group title stays above its rows.
The radio label is the display name plus the state, so the state is not color
alone.

```text
+---------------------------+
| Choose a model      [X]  |
+---------------------------+
| Databricks · AI Gateway  |
| ( ) llama-4-maverick     |
|     serving · images     |
| Generic AI Gateway       |
| ( ) gpt-oss-120b         |
|     ready · out 25000    |
| ( ) claude-sonnet-4-5    |
|     not enabled here     |
+---------------------------+
```

`Change` is a button. `Close` returns to the composer with the previous
selection. Escape does the same. A refused row is focusable so its sentence
can be read, and it is not selected. Confirming on a refused row leaves the
previous model in place.

## Copy

The server sends `refusal` or `detail`. The client shows that string. It does
not switch on the provider name to build a second sentence.

| State or cause | Sentence |
|---|---|
| `available` | `Ready.` |
| `unknown` | `Not checked yet. You can try it.` |
| `not_enabled` | `Not enabled in this workspace. An account admin must enable it on the Generic AI Gateway.` |
| `not_served` | `This model name is not served on this door.` |
| `unauthorised` | `The workspace connection was refused. Sign in again, or ask the app owner to grant the ai-gateway scope.` |
| `cap_exceeded` | `The last request asked for more output than this model allows. The limit is now {n}. Send the message again.` |
| `unknown field` | `The client sent a field this gateway rejects ({field}). The request was not retried.` |
| `thought_signature` | `This model needs a signature from the previous tool call, and this client did not keep it.` |
| `rate_limited` | `The gateway asked us to slow down. Wait a moment and send the message again.` |
| `timeout` | `The gateway did not answer in time. Send the message again once.` |
| default limits | `Output is limited to 4000 until a real ceiling is observed.` |
| images dropped | `This model has not been shown to accept images. The image stays in the composer and is not sent.` |
| scope missing, `ScopeMissing` | the sentence `DbxHttp` already builds: the app has not been granted the permission, and it names the scope |
| stall, HTTP 200 | `The agent stopped before it wrote an answer. The gateway accepted the calls. Start a new message with a smaller step.` |

`{n}` is the integer stored after `cap_from_error`. `{field}` is the quoted name
from `json: unknown field "<name>"`, with the quotes removed and the value
truncated to 80 characters. If the name cannot be parsed, the sentence omits
the parentheses rather than showing an empty pair.

The `not_enabled` sentence is the one `policy._not_selectable_reason` already
uses, with the screen name of this provider substituted for the words "AI
Gateway". One function takes the provider display name. Two copies of the
sentence are not left in the Python and the TypeScript client. The TypeScript
file `web/src/domain/models.ts` mirrors it today. The implementation updates
both from the same table or generates the client string from the payload's
`refusal`, and a test fails if they diverge ([11](11-tests-traceability.md) T-12).

## Refusal, in the composer

```text
+------------------------------------------------------------------+
| Model: claude-sonnet-4-5                                         |
| Not enabled in this workspace. An account admin must enable it   |
| on the Generic AI Gateway.                                       |
|                                                                  |
| [ Choose another model ]                                         |
+------------------------------------------------------------------+
|  message                                                    Send |
+------------------------------------------------------------------+
```

`Send` is inactive while the selected model is not selectable. The button's
accessible name says why: the refusal sentence. A person who never opens the
picker still sees the reason.

## Cap, after a failed turn

```text
+------------------------------------------------------------------+
| gpt-oss-120b                                                     |
| The last request asked for more output than this model allows.   |
| The limit is now 25000. Send the message again.                  |
+------------------------------------------------------------------+
```

The composer keeps the draft. The model stays selected. The next send uses the
lower limit. The failed turn is not replayed by the client.

## What is not on the screen

- The token, the host, and `baseURL`.
- A control that retypes a model id. Rows come from the seed ([04](04-provider-contract.md#what-the-user-is-allowed-to-add-by-hand)).
- A toggle between "serving" and "gateway" with the same radio. They are groups.
- An image affordance on a gateway row. The existing image control remains for
  rows with `sees_images` true, which these rows are not.
- A Gemini row. The family has no captured id ([05](05-data-model.md#identity)).

## Admin, same picker, different state

An account admin sees the same refusal. This app does not host the control that
enables a partner model. The sentence names the admin because that is the action
the capture describes. It does not link to a URL this repository has not stored.
