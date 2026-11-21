# 06 — Statecharts

[Index](README.md) · prev: [05 Data model](05-data-model.md) · next: [07 UX wireframes](07-ux-wireframes.md)

States use the names `ModelState` already stores. A transition that is not drawn
does not happen. Color repeats the label: mint is usable, amber is degraded or
unknown, rose is refused, lavender is a gate that an admin can open.

## Model health

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#FEF3E9','primaryTextColor':'#1F2937','primaryBorderColor':'#E8C9A8','lineColor':'#94A3B8'}}}%%
stateDiagram-v2
    [*] --> unknown
    unknown --> available: probe 2xx
    unknown --> unauthorised: 401 or 403, and not rule 4 or 5
    unknown --> not_enabled: MODEL is not enabled
    unknown --> not_served: ENDPOINT_NOT_FOUND or no longer available
    unknown --> degraded: cap, unknown field, thought_signature, 429, timeout
    available --> degraded: a later turn names a cap or a protocol error
    available --> unauthorised: a later turn is 401 or 403
    available --> not_served: a later turn says the name is gone
    degraded --> available: a later probe is 2xx
    unauthorised --> available: a later probe is 2xx
    not_enabled --> available: a later probe is 2xx
    not_served --> available: a later probe is 2xx
    available --> available: probe 2xx
```

`unknown` is usable (`ModelState.usable`). `not_enabled` and `not_served` are
not selectable. `degraded` is not usable when the session requires a healthy
model (`may_use(..., require_healthy=True)`). The picker still shows it, with
the detail, so the person can pick a different row. Gemini rows are not in this
chart because they are not seeded ([05](05-data-model.md#identity)).

A cap transition to `degraded` also writes a lower `max_output` when
`cap_from_error` returns a positive integer smaller than the stored output.
If the named number is greater than or equal to the stored output, the health
row is still written and the number is not stored. That prevents a proxy phrase
from raising a cap (P6).

## One turn

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#E8F0FE','primaryTextColor':'#1F2937','primaryBorderColor':'#A8C0E8','lineColor':'#94A3B8'}}}%%
stateDiagram-v2
    [*] --> resolving
    resolving --> refused: grant deny, not selectable, or unhealthy when required
    resolving --> configured: ResolvedModel built
    configured --> calling: child started with env var set
    calling --> answered: child returns a transcript
    calling --> cap_lowered: provider text matches cap_exceeded
    calling --> protocol: unknown field or thought_signature
    calling --> auth: 401 or 403 after phrase rules
    calling --> stalled: child exits without a transcript and HTTP was 200
    cap_lowered --> refused: the turn is not retried with the new cap automatically
    protocol --> refused
    auth --> refused
    stalled --> refused
    answered --> [*]
    refused --> [*]
```

The cap is lowered for the next session. The current turn is refused rather than
retried, because a silent retry would spend the user's wait twice and the child
has already shown a failure. The copy says the limit was reduced and the next
message can be sent. See [07](07-ux-wireframes.md#copy).

`stalled` is the §4.10 observation: exit 0, no prose, HTTP 200. It is not a
gateway state change. The model stays `available`. The turn is refused as a
product stall, using the existing stall cause if the child text matches, and
`unknown` if it does not. The provider does not invent a retry.

## Strict body

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#F3E8FD','primaryTextColor':'#1F2937','primaryBorderColor':'#C4B5E0','lineColor':'#94A3B8'}}}%%
stateDiagram-v2
    [*] --> build
    build --> strip: object contains a key starting with __copilot
    build --> send: no such key
    strip --> send: those keys removed, nothing else removed
    send --> ok: HTTP 2xx
    send --> unknown_field: body contains json unknown field
    send --> other: any other refusal
    unknown_field --> defect: recorded as protocol_error, no second POST
    ok --> [*]
    other --> [*]
    defect --> [*]
```

There is no edge from `unknown_field` back to `strip`. That edge is how a client
hides a field it should never have sent. The only strip is the one before the
first POST, and only for the captured prefix.

## Discovery, when a list API still does not exist

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#FEF3E9','primaryTextColor':'#1F2937','primaryBorderColor':'#E8C9A8','lineColor':'#94A3B8'}}}%%
stateDiagram-v2
    [*] --> seed
    seed --> probe_one: user opens the picker, TTL expired
    probe_one --> row_updated: one model's health row appended
    row_updated --> seed: other rows untouched
```

There is no transition called "replace catalogue". Serving discovery's failure
modes (`denied`, `error`, cache 300 seconds, do not cache a denial) apply on
the day a list URL is captured. They are not simulated by calling the serving
list and filtering names that contain `system.ai`.

## MCP call

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#EAF7F0','primaryTextColor':'#1F2937','primaryBorderColor':'#A8D5BE','lineColor':'#94A3B8'}}}%%
stateDiagram-v2
    [*] --> post
    post --> unwrap: a line starts with "data: "
    post --> parse: no such line
    unwrap --> parse: last data line only
    parse --> tool_ok: JSON result and isError is not true
    parse --> tool_err: isError true
    parse --> transport: status, timeout, or body is not JSON
    tool_ok --> [*]
    tool_err --> [*]
    transport --> [*]
```

`tool_err` returns the tool payload to the caller. It does not change model
health. `transport` is the MCP port's error. It does not mark
`gateway/system.ai.gpt-oss-120b` degraded. The doors are independent (P9).
