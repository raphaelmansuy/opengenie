# 06 — Formal statecharts & edge-case guards

[Index](README.md) · Previous: [05 — Architecture](05-architecture.md) · Next: [07 — AI engineering](07-ai-engineering.md)

Every interactive and asynchronous lifecycle introduced or modified in `017` is modeled as an
explicit statechart so illegal transitions are unrepresentable and every edge case in
[09 — Edge-case register](09-edge-cases.md) maps to a concrete guard.

## SC-1 — Interactive diff review & decision lifecycle (`IMP-01`, `IMP-02`)

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#E7EEFF","primaryTextColor":"#243247","primaryBorderColor":"#879AB8","lineColor":"#7C899A","tertiaryColor":"#F1E9F8"}}}%%
stateDiagram-v2
    [*] --> EmptyDiff : diff is blank or null
    [*] --> Collapsed : diff non-empty
    Collapsed --> UnifiedView : user expands details [parsed <= 1200 lines]
    Collapsed --> TruncatedView : user expands details [parsed > 1200 lines]
    UnifiedView --> SplitView : toggle Split [viewport >= 640px]
    SplitView --> UnifiedView : toggle Unified or narrow viewport
    TruncatedView --> SplitView : toggle Split [capped lines only]
    SplitView --> TruncatedView : toggle Unified [was truncated]
    UnifiedView --> Copying : click Copy diff
    SplitView --> Copying : click Copy diff
    Copying --> Copied : clipboard ok
    Copying --> CopyFailed : clipboard denied [E04]
    Copied --> UnifiedView : 1.6s timer
    CopyFailed --> UnifiedView : 2.0s timer

    classDef blue fill:#E7EEFF,stroke:#879AB8,color:#243247
    classDef mint fill:#E4F3EA,stroke:#829F8B,color:#243247
    classDef amber fill:#FFF1D9,stroke:#B49A6F,color:#243247
    classDef rose fill:#F8E6EB,stroke:#B48D99,color:#243247
    classDef lavender fill:#F1E9F8,stroke:#A18AB5,color:#243247

    class EmptyDiff,Collapsed blue
    class UnifiedView,SplitView,Copied mint
    class TruncatedView,Copying amber
    class CopyFailed rose
```

| Guard / Edge Case | Behaviour |
|---|---|
| `EmptyDiff` (`E01`) | Do not render empty diff chrome; show concise "No line diff attached" note. |
| `TruncatedView` (`E02`) | Parse and render first `1,200` lines only; show exact omitted line count; Copy still copies full diff text safely. |
| Narrow viewport (`E03`) | Split grid automatically collapses to single-column unified stack below `640px` or inside narrow docks (`overflow-x: auto` confined to diff box). |
| Clipboard denied (`E04`) | Catch rejection, show "Copy unavailable", never throw unhandled promise rejection. |
| Non-unified text (`E05`) | Lines without `@@` headers still classify `+`/`-`/context lines with sequential line numbers; zero crashes. |

## SC-2 — Context pressure & compaction lifecycle (`IMP-03`, `IMP-04`, `IMP-05`)

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#E7EEFF","primaryTextColor":"#243247","primaryBorderColor":"#879AB8","lineColor":"#7C899A","tertiaryColor":"#F1E9F8"}}}%%
stateDiagram-v2
    [*] --> Unknown : contextWindow <= 0 or missing [E08]
    [*] --> Healthy : pct < 70%
    Healthy --> Elevated : pct >= 70% and pct < 90%
    Elevated --> Critical : pct >= 90%
    Critical --> Compacting : click Compact or /compact [session idle]
    Elevated --> Compacting : click Compact or /compact [session idle]
    Healthy --> Compacting : user runs /compact [session idle]
    Compacting --> Compacted : API changed=true & SSE session.compacted
    Compacting --> NoOp : API changed=false [E09]
    Compacting --> CompactError : HTTP error or network drop [E10]
    Compacted --> Healthy : recalculated pct < 70%
    Compacted --> Elevated : recalculated pct >= 70%
    NoOp --> Healthy : clear notice after 4s
    CompactError --> Elevated : user retries or dismisses

    classDef blue fill:#E7EEFF,stroke:#879AB8,color:#243247
    classDef mint fill:#E4F3EA,stroke:#829F8B,color:#243247
    classDef amber fill:#FFF1D9,stroke:#B49A6F,color:#243247
    classDef rose fill:#F8E6EB,stroke:#B48D99,color:#243247
    classDef lavender fill:#F1E9F8,stroke:#A18AB5,color:#243247

    class Unknown blue
    class Healthy,Compacted mint
    class Elevated,NoOp amber
    class Critical,CompactError rose
    class Compacting lavender
```

| Guard / Edge Case | Behaviour |
|---|---|
| Running turn (`E06`) | Compact button is disabled while `running === true`; `/compact` returns inline notice "Wait for the current turn to finish before compacting." |
| Double click (`E07`) | `Compacting` state ignores re-entrant clicks until promise settles. |
| Missing `contextWindow` (`E08`) | Meter stays `Unknown` (no `NaN%` or `Infinity%`). |
| Server `changed=false` (`E09`) | Shows honest neutral notice ("Already compact — nothing needed shedding") without faking a compaction card. |
| Duplicate SSE replay (`E11`) | `patchCompaction` upserts by `compactionId` so reconnect replay never duplicates rows. |

## SC-3 — Failed cell diagnosis vs. repair lifecycle (`IMP-08`)

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#E7EEFF","primaryTextColor":"#243247","primaryBorderColor":"#879AB8","lineColor":"#7C899A","tertiaryColor":"#F1E9F8"}}}%%
stateDiagram-v2
    [*] --> Idle : cell has no run
    Idle --> Running : user runs cell
    Running --> Done : state=done
    Running --> FailedClassified : state=failed [classifyCellError(error)]
    FailedClassified --> Diagnosing : click Diagnose error [read-only prompt]
    FailedClassified --> Fixing : click Fix with agent [edit+proof prompt]
    Diagnosing --> Done : agent replies with root cause (no cell edit)
    Fixing --> Running : agent edits cell and re-runs
    FailedClassified --> Idle : user clears cell output

    classDef blue fill:#E7EEFF,stroke:#879AB8,color:#243247
    classDef mint fill:#E4F3EA,stroke:#829F8B,color:#243247
    classDef amber fill:#FFF1D9,stroke:#B49A6F,color:#243247
    classDef rose fill:#F8E6EB,stroke:#B48D99,color:#243247
    classDef lavender fill:#F1E9F8,stroke:#A18AB5,color:#243247

    class Idle blue
    class Running,Diagnosing lavender
    class Done mint
    class FailedClassified rose
    class Fixing amber
```

| Guard / Edge Case | Behaviour |
|---|---|
| Empty error text (`E13`) | `classifyCellError("")` returns `{ kind: "runtime", label: "Execution error" }` safely; buttons still pass fallback message. |
| Huge stack trace (`E14`) | Prompt builder truncates error string to `600` chars so cell error cannot blow up token budget. |
| Read-only viewer (`E15`) | When `onFix` / `onDiagnose` are omitted (read-only view), buttons are not rendered. |

## SC-4 — Autonomy mode & tools inspector popover (`IMP-06`, `IMP-07`)

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#E7EEFF","primaryTextColor":"#243247","primaryBorderColor":"#879AB8","lineColor":"#7C899A","tertiaryColor":"#F1E9F8"}}}%%
stateDiagram-v2
    [*] --> Review : default session mode
    Review --> SavingMode : select Plan or Auto
    Plan --> SavingMode : select Review or Auto
    Auto --> SavingMode : select Plan or Review
    SavingMode --> Plan : PATCH 200 mode=plan
    SavingMode --> Review : PATCH 200 mode=review
    SavingMode --> Auto : PATCH 200 mode=auto
    SavingMode --> ModeError : PATCH failed [E17]
    ModeError --> Review : revert select to server mode

    state ToolsPopover {
        [*] --> PopClosed
        PopClosed --> PopOpen : click "N tools"
        PopOpen --> PopClosed : click toggle, Escape, or outside click [E18]
    }

    classDef blue fill:#E7EEFF,stroke:#879AB8,color:#243247
    classDef mint fill:#E4F3EA,stroke:#829F8B,color:#243247
    classDef amber fill:#FFF1D9,stroke:#B49A6F,color:#243247
    classDef rose fill:#F8E6EB,stroke:#B48D99,color:#243247
    classDef lavender fill:#F1E9F8,stroke:#A18AB5,color:#243247

    class Plan,PopClosed lavender
    class Review amber
    class Auto,PopOpen mint
    class SavingMode blue
    class ModeError rose
```

## SC-5 — Assistant code block to notebook cell insertion (`IMP-09`)

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#E7EEFF","primaryTextColor":"#243247","primaryBorderColor":"#879AB8","lineColor":"#7C899A","tertiaryColor":"#F1E9F8"}}}%%
stateDiagram-v2
    [*] --> Unavailable : no open notebook or read-only / non-notebook file [E19]
    [*] --> Ready : writable notebook active in EditorSurface
    Ready --> Inserted : click Insert cell [normalize language]
    Inserted --> Ready : 1.8s confirmation timeout
    Ready --> Unavailable : user switches tab to Mission or non-notebook [E20]

    classDef blue fill:#E7EEFF,stroke:#879AB8,color:#243247
    classDef mint fill:#E4F3EA,stroke:#829F8B,color:#243247

    class Unavailable blue
    class Ready,Inserted mint
```
