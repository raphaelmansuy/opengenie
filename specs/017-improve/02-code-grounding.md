# 02 — Code grounding

[Index](README.md) · Previous: [01 — Five whys](01-five-whys.md) · Next: [03 — Requirements](03-requirements.md)

Baseline verified on `main` at commit `054b5aa` (`make check`: `tsc` 0 errors, `ruff` clean,
`pytest` 2,371 passed / 40 skipped, `vitest` 90 files / 1,293 passed).

## Findings

### C01
**Raw monochrome diff rendering in `ChangeCard`**
- **Location:** `apps/coding-agent/web/src/components/work/ChangeCard.tsx:51-57`, `apps/coding-agent/web/src/work.css:112-121`
- **Observation:** `row.diff` is dumped directly into `<pre className="work-diff" tabIndex={0}>{row.diff}</pre>`.
  There is no line-by-line `+` / `-` / `@@` styling, no old/new line numbers, no `+N -M` stat pill,
  no side-by-side split view, no Copy Diff button, and no line-count cap for giant diffs.
- **Impact:** Developers reviewing agent edits must visually scan plain monochrome text. High cognitive
  load increases accidental approvals of subtle logic or column bugs.
- **Addressed by:** [IMP-01](03-requirements.md#requirements), [IMP-02](03-requirements.md#requirements).

### C02
**Contract mismatch silently drops server `session.compacted` events**
- **Location:** `apps/coding-agent/api/domain/events.py:256-264`, `apps/coding-agent/api/services/session_service.py:605-628`, `apps/coding-agent/web/src/domain/agentupdates.ts:18-35`
- **Observation:** `session_compacted()` emits `{**plan, "summary": summary}` where `plan` has keys
  `kept`, `summarised`, `reason`, `tokensBefore`, `tokensAfter` — **no `compactionId` and no `status`**,
  and `summary` is a `str`. Meanwhile `patchCompaction()` immediately returns `rows` unchanged if
  `typeof event.compactionId !== "string" || !event.compactionId`, and only accepts `Array.isArray(event.summary)`.
- **Impact:** Every compaction committed via `POST /api/sessions/{sid}/compact` is written to the
  journal and silently ignored by the browser UI.
- **Addressed by:** [IMP-03](03-requirements.md#requirements).

### C03
**`api.compact()` is dead code in the front end**
- **Location:** `apps/coding-agent/web/src/api/client.ts:324`, `apps/coding-agent/api/routers/api.py:602-613`
- **Observation:** `api.compact(id)` exists in `client.ts` and `POST /api/sessions/{sid}/compact` is
  wired on the server, yet grep across `web/src/` shows zero callers outside `client.ts`.
- **Impact:** Users have no way to compact a long session from the UI or via `/compact`.
- **Addressed by:** [IMP-04](03-requirements.md#requirements), [IMP-05](03-requirements.md#requirements).

### C04
**Context meter lacks pressure tiers, cache hit-rate, and actions**
- **Location:** `apps/coding-agent/web/src/components/AgentMeter.tsx:1-13`
- **Observation:** `AgentMeter` renders only `Context {percent}%`, a bare `<meter>`, and raw cost text.
  It does not surface prompt-cache hit rate (even though `turn.usage.cached` and `turn.usage.input`
  are already tracked in `SessionView`), gives no visual escalation at 70%/90% capacity, and provides
  no button to trigger compaction.
- **Impact:** Users cannot see whether prompt caching is working or act before hitting context truncation.
- **Addressed by:** [IMP-04](03-requirements.md#requirements), [IMP-05](03-requirements.md#requirements).

### C05
**Follow-up suggestions broken for V2 facade tools**
- **Location:** `apps/coding-agent/web/src/domain/followups.ts:15-17`
- **Observation:** Regexes only match V1 legacy tool names:
  `WROTE = /write_(notebook|file)/`, `RAN_NOTEBOOK = /run_notebook/`, `SQL = /(run_sql|sql|query)/`.
  Under the V2 facade (`api/services/toolbox.py:12-69`), tools are `dbx_edit`, `dbx_create`,
  `dbx_define`, `dbx_run`, `dbx_run_sql`, and `dbx_operation`. None of `dbx_edit`, `dbx_create`,
  `dbx_define`, or `dbx_run` match `WROTE` or `RAN_NOTEBOOK`.
- **Impact:** Nearly every V2 coding turn falls back to generic filler chips (`Summarise what you did`,
  `What should I check next?`), losing context-specific next steps.
- **Addressed by:** [IMP-10](03-requirements.md#requirements).

### C06
**Failed cell output conflates diagnosis and mutation; no error classification**
- **Location:** `apps/coding-agent/web/src/components/CellOutput.tsx:209-214`, `apps/coding-agent/web/src/domain/cellprompt.ts:43-50`
- **Observation:** Failed cells offer only a single `Fix with agent` button that instructs the agent
  to edit and re-run the cell. There is no read-only `Diagnose error` action (unlike Genie Code's
  Diagnose Error vs. Quick Fix), and no structured error classification badge (SQL syntax, missing
  table/column, permission denied, Python exception, timeout).
- **Impact:** Developers who want to understand *why* a query or PySpark cell failed before allowing
  any code edit must manually copy the stack trace into the chat composer.
- **Addressed by:** [IMP-08](03-requirements.md#requirements).

### C07
**Assistant code blocks cannot insert into an open notebook**
- **Location:** `apps/coding-agent/web/src/components/Markdown.tsx:84-86`, `apps/coding-agent/web/src/components/DocContext.ts:9-12`
- **Observation:** `Markdown.tsx` only provides `Open as query` for `sql` code blocks and `Copy` for
  all blocks. When a writable notebook is open in the centre pane, there is no `Insert cell` action
  to drop a generated Python/SQL/Scala/R cell directly into the notebook.
- **Impact:** High copy-paste friction during iterative notebook development.
- **Addressed by:** [IMP-09](03-requirements.md#requirements).

### C08
**Minimal autonomy bar obscures policy meaning and available tools**
- **Location:** `apps/coding-agent/web/src/components/work/controls.tsx:7-28`, `apps/coding-agent/web/src/work.css:1-27`
- **Observation:** `WorkComposerBar` renders a plain `<select>` (`Plan`, `Review`, `Auto`) and static
  text `{data.toolCount} tools available`. It does not communicate the active policy rule at a glance,
  does not badge pending changes/run reviews, and does not let users inspect the active tool/fence
  summary without switching tabs.
- **Impact:** Users hesitate to switch between Plan, Review, and Auto because the effect on writes
  and runs is not stated inline.
- **Addressed by:** [IMP-06](03-requirements.md#requirements), [IMP-07](03-requirements.md#requirements).

### C09
**Evidence verification grades buried in collapsed details**
- **Location:** `apps/coding-agent/web/src/components/Transcript.tsx:174-196`, `apps/coding-agent/web/src/components/MissionScreen.tsx:30-48`
- **Observation:** Backend `invocation_evidence.grade()` (`api/domain/invocation_evidence.py:72-80`)
  computes four precise grades (`verified`, `supported`, `unverified`, `contradicted`). In
  `Transcript.tsx`, every row collapses to binary check/alert without displaying the grade pill or
  contradiction reason inline; in `MissionScreen.tsx`, `Grade:` is buried inside `<details>`.
- **Impact:** OpenGenie's signature trust guarantee ("done means proven") is visually flattened.
- **Addressed by:** [IMP-12](03-requirements.md#requirements).

### C10
**Global cross-session lock in `WorkEvents.flush()`**
- **Location:** `apps/coding-agent/api/services/work_events.py:12, 29-54`
- **Observation:** A single `self._lock = asyncio.Lock()` serializes `flush()` across *all* sessions
  in the process.
- **Impact:** One slow or retrying session outbox flush blocks event delivery for every other concurrent
  user session in the Databricks App process.
- **Addressed by:** [IMP-13](03-requirements.md#requirements).

### C11
**O(C × I) nested scan in `AgentWork.observation_proof()`**
- **Location:** `apps/coding-agent/api/services/agent_work.py:189-232`
- **Observation:** `observation_proof()` loads all turn invocations (`I`), then for every `change`
  (`C`) and every `operation` (`O`) performs linear `any(... for c in calls)` scans across all calls.
  Furthermore `evidence_calls()` pages *all* session invocations across all turns before filtering by `turnId`.
- **Impact:** Verification latency grows quadratically as multi-step agent turns accumulate changes
  and tool calls.
- **Addressed by:** [IMP-14](03-requirements.md#requirements).

### C12
**Linear approval scan per `tool_call.updated` in `TurnService._drain()`**
- **Location:** `apps/coding-agent/api/services/turn_service.py:375-416`
- **Observation:** Every `tool_call.updated` event with `rawInput` iterates all pending approvals twice
  (`list(live.extra.get("approvals", {}).values())`).
- **Impact:** O(A) per event instead of O(1) lookup by `callId`.
- **Addressed by:** [IMP-15](03-requirements.md#requirements).

### C13
**N+1 sequential queries in `PostgresAgentLedgers.storage()`**
- **Location:** `apps/coding-agent/api/adapters/durable/agent_postgres.py:150-161`
- **Observation:** Loops over every entity in `KINDS` (10 tables) executing 10 separate `SELECT COUNT(*),
  COALESCE(SUM(octet_length(body)), 0)` round-trips over Lakebase/Postgres.
- **Impact:** 10× network round-trip latency on Lakebase per storage inspection call.
- **Addressed by:** [IMP-16](03-requirements.md#requirements).

### C14
**Streaming O(T × C) full-history scan in `App.tsx`**
- **Location:** `apps/coding-agent/web/src/App.tsx:464-483`
- **Observation:** `useEffect(..., [session.turns])` fires on every `message.delta` / `thought.delta`
  token and iterates over every turn and every tool call in the session.
- **Impact:** Unnecessary CPU churn proportional to session length on every streamed token.
- **Addressed by:** [IMP-17](03-requirements.md#requirements).

### C15
**Unmemoized `missionView()` per dropdown option and `executionMap()` per render**
- **Location:** `apps/coding-agent/web/src/components/MissionScreen.tsx:144`, `apps/coding-agent/web/src/components/NotebookEditor.tsx:411`
- **Observation:** `MissionScreen` computes `missionView(session, t, conn)` inside `.map()` for every
  turn in the `<select>` picker on every render (and `missionView` calls `artifactsOf` and `missionProof`).
  `NotebookEditor` recomputes `executionMap(cells, runs ?? {}, runnable, batch)` on every render/focus change.
- **Impact:** O(T × tools) per streaming delta in `MissionScreen` and redundant cell-map rebuilds on
  every keystroke/focus in `NotebookEditor`.
- **Addressed by:** [IMP-17](03-requirements.md#requirements).

### C16
**Production debug leak (`window.__m`) and missing Databricks 2026 slash workflows**
- **Location:** `apps/coding-agent/web/src/components/EditorSurface.tsx:85-90`, `apps/coding-agent/web/src/domain/commands.ts:9-23`
- **Observation:** `EditorSurface` pushes random mount/unmount strings into `window.__m` unconditionally
  on every mount/unmount (never bounded, never cleared). Meanwhile `commands.ts` lacks modern Databricks
  agent commands (`/diagnose`, `/migrate`, `/pipeline`, `/lineage`, `/review`, `/compact`).
- **Impact:** Unbounded global array leak on long-lived tabs; missing high-frequency Databricks workflows.
- **Addressed by:** [IMP-11](03-requirements.md#requirements), [IMP-18](03-requirements.md#requirements).
