# 01 — Five whys and first principles

[Index](README.md) · Next: [02 — Code grounding](02-code-grounding.md) · Requirements: [03](03-requirements.md)

## Five whys

Every finding below is grounded in direct inspection of `apps/coding-agent` at commit `054b5aa`
([02 — Code grounding](02-code-grounding.md)) and benchmarked against Databricks Genie Code
documentation (updated November 2026).

1. **Why isn't OpenGenie yet clearly surpassing Databricks Genie Code on day-to-day coding ergonomics?**
   OpenGenie already beats Genie Code on architectural fundamentals — arbitrary model choice,
   deterministic write fencing, durable Lakebase session journals, and evidence-verified completion.
   However, the *last-mile developer loop* (inspecting proposed diffs, diagnosing failing cells,
   moving generated code into a notebook, managing context pressure, and trusting next-step
   suggestions) still exposes raw plumbing: flat `<pre>` diffs ([C01](02-code-grounding.md#c01)),
   unwired compaction ([C02](02-code-grounding.md#c02)), broken V2 follow-ups ([C05](02-code-grounding.md#c05)),
   and single-mode cell error handling ([C06](02-code-grounding.md#c06)).

2. **Why did those gaps emerge even with 3,664 passing tests?**
   Features landed across incremental specs (`006` through `016`). When spec `014` migrated tool
   names from V1 (`write_notebook`, `run_notebook`) to V2 (`dbx_edit`, `dbx_create`, `dbx_run`),
   downstream heuristics like `followups.ts` were left matching V1 regexes ([C05](02-code-grounding.md#c05)).
   When `session.compacted` was split between ACP events (`compactionId` + block array) and the
   app's own `POST /compact` endpoint (`kept`/`summarised` + string `summary`), the reducer silently
   dropped the app's own event ([C02](02-code-grounding.md#c02)), and no UI control called `api.compact()`.

3. **Why does a raw diff or opaque context meter hurt coding quality, not just aesthetics?**
   In November 2026 agentic engineering, **human review speed and context hygiene are the primary
   bottlenecks on agent reliability**. A flat monochrome diff forces developers to mentally parse
   unified diff prefixes (`+`, `-`, `@@`) and makes subtle off-by-one or column bugs easy to approve
   blindly. An unactionable context percentage hides prompt-cache efficiency and leaves users unable
   to shed stale middle turns before context degradation causes hallucinated citations.

4. **Why do backend and frontend O(n²) loops matter for a Databricks coding agent?**
   Real Databricks engineering sessions accumulate 30–100 turns, dozens of proposed changes, and
   hundreds of tool invocations. Nested scans (`observation_proof` O(C × I) in [C11](02-code-grounding.md#c11),
   `App.tsx` scanning all turns × tools on every streaming token delta in [C14](02-code-grounding.md#c14),
   `MissionScreen` recomputing `missionView()` per turn option on every delta in [C15](02-code-grounding.md#c15),
   and `WorkEvents` serializing all sessions behind one global lock in [C10](02-code-grounding.md#c10))
   compound latency and cause jank precisely during the long, complex missions where a coding agent
   creates the most value.

5. **Why solve these together through pure domain modules and explicit statecharts instead of ad-hoc UI patches?**
   Every surface in OpenGenie (`AssistantDock`, `MissionScreen`, `WorkPanel`, `NotebookEditor`,
   `EditorSurface`) shares state with the durable event journal and server-side policy engine.
   Placing parsing, classification, pressure math, and formatting into small, zero-I/O domain modules
   (`diff.ts`, `contextmeter.ts`, `cellerror.ts`, `followups.ts`, `commands.ts`) enforces DRY/SOLID,
   guarantees deterministic unit testing, bounds worst-case CPU/memory strictly to O(n), and prevents
   UI/server contract drift ([05 — Architecture](05-architecture.md), [06 — Statecharts](06-statecharts.md)).

## First principles

| ID | Principle | Concrete architectural consequence | Requirements |
|---|---|---|---|
| **FP-1** | **Deterministic safety outranks heuristic approval** | Never replace server-side fencing or explicit revision checks with an LLM classifier; make the deterministic mode (`Plan` / `Review` / `Auto`) and active tool list unmistakably clear before every turn. | `IMP-06`, `IMP-07` |
| **FP-2** | **Review is a first-class coding surface** | Proposed edits are rendered with semantic diff structure (Unified & Split views, line numbers, `+N/-M` summary, bounded line caps), never as unparsed raw text. | `IMP-01`, `IMP-02` |
| **FP-3** | **Context is a finite, observable budget** | Expose context utilization thresholds, prompt-cache hit rate, and one-click auditable compaction; every compaction event emitted by the server must be rendered by the client without silent drops. | `IMP-03`, `IMP-04`, `IMP-05` |
| **FP-4** | **Read-only diagnosis and mutation are separate intents** | On a failing cell, inspecting root cause (`Diagnose error`) must never mutate workspace code; fixing (`Fix with agent`) explicitly targets that cell and demands execution proof. | `IMP-08` |
| **FP-5** | **Minimize friction between assistant prose and executable code** | Code snippets in assistant replies must bridge directly to the active notebook (`Insert cell`) or SQL editor (`Open as query`) without destroying unsaved work or bypassing the write fence. | `IMP-09` |
| **FP-6** | **Every heuristic must track the canonical tool contract** | Follow-up chips, evidence grades, and slash workflows must speak the current V2 facade tool vocabulary (`dbx_edit`, `dbx_create`, `dbx_run`, `dbx_run_sql`, `dbx_operation`) while preserving V1 backward compatibility. | `IMP-10`, `IMP-11`, `IMP-12` |
| **FP-7** | **Work scales linearly with the delta, never quadratically with history** | Hot paths across streaming deltas, ledger verification, event flushing, and storage reporting must stay O(1) or O(n) with bounded memory and zero global cross-session locks. | `IMP-13`–`IMP-17` |
| **FP-8** | **Untrusted data stays data; degraded states stay honest** | Error classifiers, diff parsers, and compaction summaries treat all workspace/model strings as plain text (never `innerHTML`), cap oversized payloads visibly, and never claim success when nothing changed. | `IMP-02`, `IMP-03`, `IMP-18` |

## Success criteria

This upgrade succeeds when:
1. All 18 requirements (`IMP-01`–`IMP-18`) are implemented with zero regressions across all existing
   Python (`pytest`), TypeScript (`tsc`), linter (`ruff`), and front-end (`vitest`) suites.
2. Every edge case (`E01`–`E32`) is guarded by pure transition logic and covered by automated unit,
   integration, or Playwright E2E tests.
3. All Playwright E2E scenarios run against the real FastAPI + SQLite + built React bundle, save
   screenshots to `specs/017-improve/e2e/screenshots/`, and every screenshot passes visual inspection
   across desktop, narrow/mobile, light, and dark themes.
