# 03 — Product & engineering requirements

[Index](README.md) · Previous: [02 — Code grounding](02-code-grounding.md) · Next: [04 — UX wireframes](04-ux-wireframes.md)

## Requirements

| ID | Priority | Pillar | Requirement | Grounding | Tests |
|---|---|---|---|---|---|
| **IMP-01** | P0 | Diff Review | `ChangeCard` renders proposed diffs through a shared `DiffView` component with semantic line coloring (`add`, `del`, `hunk`, `meta`, `ctx`), old/new line numbers, `+added / -removed` stats pill, Copy Diff button, and a **Unified / Split** view toggle. | [C01](02-code-grounding.md#c01) | `T01`, `T13` |
| **IMP-02** | P0 | Diff Safety | Diff parsing runs in pure O(n) single-pass domain code (`web/src/domain/diff.ts`), renders strictly as plain text (zero `innerHTML`), bounds displayed lines (`MAX_DIFF_LINES = 1200`) with an explicit truncation notice, and handles malformed/non-unified diffs gracefully. | [C01](02-code-grounding.md#c01) | `T01`, `T13` |
| **IMP-03** | P0 | Compaction Parity | `session_compacted()` emits a stable `compactionId`, `status: "completed"`, and structured summary text; `patchCompaction()` accepts both ACP array-block events and server plan/string compaction events without dropping either, preserving all existing ACP invariants. | [C02](02-code-grounding.md#c02) | `T02`, `T08` |
| **IMP-04** | P0 | Context Meter | `AgentMeter` computes context pressure (`healthy` < 70%, `elevated` 70–89%, `critical` >= 90%, `unknown`) and cumulative prompt-cache hit-rate (`cached / input`) via pure `web/src/domain/contextmeter.ts`, displaying clear accessible labels and semantic bar tones. | [C04](02-code-grounding.md#c04) | `T03`, `T14` |
| **IMP-05** | P0 | Compaction Action | Users can trigger `POST /api/sessions/{sid}/compact` directly from `AgentMeter` (when session is active and idle/eligible) or by running `/compact` in `Composer`, with inline status/feedback when compacted or when nothing needs shedding. | [C02](02-code-grounding.md#c02), [C03](02-code-grounding.md#c03) | `T03`, `T08`, `T14` |
| **IMP-06** | P0 | Autonomy Bar | `WorkComposerBar` preserves the accessible `Autonomy mode` `<select>` control for keyboard/E2E parity while displaying a semantic mode tone badge (`Plan` / `Review` / `Auto`), concise inline policy summary (`Read-only` / `Approve writes & runs` / `Auto inside folder`), and pending-decision count pill when reviews await action. | [C08](02-code-grounding.md#c08) | `T04`, `T13` |
| **IMP-07** | P1 | Tool Inspector | Clicking the tool count button in `WorkComposerBar` toggles an accessible, Escape-dismissible **Active Tools & Fence** popover showing the current working folder, schema fence, autonomy rule, and capability breakdown (Read / Change / Run). | [C08](02-code-grounding.md#c08) | `T04`, `T13` |
| **IMP-08** | P0 | Cell Diagnostics | Pure `web/src/domain/cellerror.ts` classifies Databricks cell failures (`sql_syntax`, `missing_object`, `permission`, `python_error`, `timeout`, `runtime`). Failed `CellOutput` displays an error-class pill and two distinct actions: **Diagnose error** (read-only explanation via `diagnosePrompt()`) and **Fix with agent** (targeted cell repair via `fixPrompt()`). | [C06](02-code-grounding.md#c06) | `T05`, `T15` |
| **IMP-09** | P0 | Code-to-Notebook | When a writable notebook is active in the centre pane, code blocks inside assistant answers (`Markdown.tsx`) display an **Insert cell** button alongside **Copy** (and **Open as query** for SQL) that appends a new code cell of the matching language and shows confirmation feedback without overwriting unsaved edits. | [C07](02-code-grounding.md#c07) | `T06`, `T15` |
| **IMP-10** | P0 | V2 Follow-Ups | `web/src/domain/followups.ts` recognizes both V1 (`write_notebook`, `run_notebook`) and V2 (`dbx_edit`, `dbx_create`, `dbx_define`, `dbx_run`, `dbx_run_sql`, `dbx_operation`) tool calls, plus paused/pending review turns, producing truthful, deduplicated next-step chips. | [C05](02-code-grounding.md#c05) | `T07`, `T14` |
| **IMP-11** | P0 | Databricks Slash Suite | `web/src/domain/commands.ts` expands slash templates with November 2026 Databricks workflows: `/diagnose`, `/migrate`, `/pipeline`, `/lineage`, `/review`, and `/compact`, with instant execution support for `/compact`. | [C16](02-code-grounding.md#c16) | `T07`, `T14` |
| **IMP-12** | P0 | Evidence Clarity | Both `Transcript` and `MissionScreen` display explicit semantic grade badges (`Verified`, `Supported`, `Unverified`, `Contradicted`) per evidence row, with contradiction reasons surfaced directly rather than hidden behind collapsed toggles. | [C09](02-code-grounding.md#c09) | `T06`, `T14` |
| **IMP-13** | P0 | Concurrency | `WorkEvents.flush()` uses per-session `asyncio.Lock` instances (with safe global-flush coordination) so flushing session A never blocks session B. | [C10](02-code-grounding.md#c10) | `T09` |
| **IMP-14** | P0 | O(n) Verification | `AgentWork.observation_proof()` builds an O(I) hash index over completed invocations keyed by `(asset_kind, asset_id)` so verification runs in O(C + O + I) instead of O((C + O) × I). | [C11](02-code-grounding.md#c11) | `T10` |
| **IMP-15** | P0 | O(1) Approval Lookup | `TurnService._drain()` maintains an O(1) `callId -> approvalId` index in `live.extra` for `tool_call.updated` enrichment instead of linearly scanning all approvals per event. | [C12](02-code-grounding.md#c12) | `T11` |
| **IMP-16** | P0 | DB Round-Trips | `PostgresAgentLedgers.storage()` aggregates counts and payload bytes across all ledger tables in a single `UNION ALL` SQL query (1 round-trip instead of 10). | [C13](02-code-grounding.md#c13) | `T12` |
| **IMP-17** | P0 | Frontend O(n) | Memoize `MissionScreen` turn picker labels (`useMemo`), memoize `NotebookEditor` `executionMap` (`useMemo`), and track processed tool-call high-water marks in `App.tsx` so streaming token deltas avoid full-history rescans. | [C14](02-code-grounding.md#c14), [C15](02-code-grounding.md#c15) | `T06`, `T16` |
| **IMP-18** | P0 | Hygiene | Remove the unbounded `window.__m` debug array leak from `EditorSurface.tsx` while ensuring zero regressions in notebook mount/unmount stability. | [C16](02-code-grounding.md#c16) | `T06` |

## Acceptance gates

1. **Static & type gate:** `npx tsc -b --noEmit` and `ruff check api tools --select F821` pass with 0 errors.
2. **Backend unit & integration gate:** All existing + new `pytest` tests pass (0 failures).
3. **Front-end unit & component gate:** All existing + new `vitest` tests pass (0 failures).
4. **E2E & visual perfection gate:** Dedicated Playwright E2E suite (`apps/coding-agent/web/scripts/improve-017-e2e.mjs`)
   exercises every feature end-to-end against a real FastAPI + SQLite + built React app, asserts zero
   console/page errors and zero horizontal overflow, saves screenshots in
   `specs/017-improve/e2e/screenshots/`, and every screenshot is visually inspected and iteratively
   refined until clean across light, dark, desktop, and mobile viewports.
5. **Spec integrity gate:** `verify-spec-links.mjs`, `verify-spec-ascii.mjs`, and `verify-spec-mermaid.mjs`
   pass cleanly on `specs/017-improve`.
