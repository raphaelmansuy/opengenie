# 08 — Seven expert lenses & O(n) complexity analysis

[Index](README.md) · Previous: [07 — AI engineering](07-ai-engineering.md) · Next: [09 — Edge cases](09-edge-cases.md)

Every change in `017` was evaluated through seven independent engineering lenses before writing code.

## L1 — Product Owner lens
- **Value proposition vs. Genie Code:** Keep OpenGenie's hard moats (arbitrary models, deterministic
  write fences, revision-guarded undo, evidence-backed proof) and erase every day-to-day ergonomic
  deficit (diff review, diagnose vs. fix, insert cell, context compaction, V2 follow-ups, slash suite).
- **Backward compatibility:** Preserve every existing public REST path, existing UI button labels
  tested by workflows (`Fix with agent`, `Autonomy mode`, `Inspect proposed diff`), and V1 tool names.
- **Measurable outcome:** Every new user-facing capability is verifiable visually in Playwright E2E
  screenshots across desktop, mobile, light, and dark themes.

## L2 — Full Stack Developer lens
- **DRY:** One `parseUnifiedDiff` engine (`domain/diff.ts`) powers both Unified and Split views and
  diff stat counters; one `classifyCellError` classifier (`domain/cellerror.ts`) drives both the UI
  badge and the `diagnosePrompt` hint; one `contextMeterState` (`domain/contextmeter.ts`) drives the
  progress bar, threshold tone, cache ratio, and compact button state.
- **SOLID:**
  - *Single Responsibility:* UI components (`DiffView`, `AgentMeter`, `WorkComposerBar`, `CellOutput`)
    only render; pure domain modules own all parsing, math, and prompt shaping.
  - *Open/Closed:* `followups.ts` and `cellerror.ts` use declarative rule tables so adding a new V3
    tool or Databricks SQLSTATE never alters control flow.
  - *Dependency Inversion:* `Markdown.tsx` consumes `InsertNotebookCell` via `DocContext` instead of
    coupling to `EditorSurface` internals.
- **Contract parity:** Fixed the silent event drop between `api/domain/events.py` (`session_compacted`)
  and `web/src/domain/agentupdates.ts` (`patchCompaction`).

## L3 — Database Expert lens
- **Lakebase / Postgres round-trips (`IMP-16`):** `PostgresAgentLedgers.storage()` previously issued
  10 sequential queries (one per `KINDS` table). Replacing the loop with a single `UNION ALL` query
  over the fixed allow-listed table dictionary reduces latency by ~10× on remote Lakebase instances
  while keeping SQL injection impossible (table names come strictly from the static `_TABLES` constant).
- **Schema stability:** Zero breaking DDL migrations required — `compactionId` and `status` are stored
  cleanly in the existing JSONB `events.payload` column, maintaining 100% compatibility with existing
  SQLite and Postgres journals.
- **Idempotency:** Compaction events carry a deterministic or UUID `compactionId` so SSE replay on
  reconnect upserts cleanly in O(k) without duplicate records.

## L4 — UX & UI Designer lens
- **Visual hierarchy:** Replace raw monochrome `<pre>` diff dumps and flat light-only hexes in
  `work.css` (`#f5f4f8`, `#efedf7`) with theme-aware CSS custom properties (`--bg-elevated`,
  `--diff-add-bg`, `--diff-del-bg`, `--tone-ok`, `--tone-warn`, `--tone-danger`) that look crisp in
  both light and dark themes.
- **Information density in 380px dock:** Use compact pastel pills (`+3 -2`, `Verified`, `Missing column`,
  `64% cached`), segmented pill toggles (`Unified | Split`), and an on-demand popover for the active
  tool list so the composer never feels cramped.
- **Accessibility:** Every status uses both text and tone (never color alone), every interactive
  control has accessible names and keyboard focus rings (`:focus-visible`), popovers close on `Escape`,
  and diff containers respect `overflow-x: auto` without causing page-level horizontal scroll.

## L5 — AI Engineer lens
- **Context hygiene:** Developers see exact context pressure (`healthy` < 70%, `elevated` >= 70%,
  `critical` >= 90%), prompt-cache hit rate, and can trigger auditable `/compact` compaction before
  reasoning degrades.
- **Safe debugging separation:** `Diagnose error` explicitly instructs the model not to modify cells
  or execute code; `Fix with agent` explicitly constrains edits to the failing cell and demands an
  execution proof.
- **Honest verification:** Surfaced `Verified` / `Supported` / `Unverified` / `Contradicted` badges
  reinforce that agent claims are backed by server-observed tool evidence.

## L6 — System Design Expert lens
- **Fault isolation (`IMP-13`):** Replacing the global `WorkEvents._lock` with a per-session lock
  registry (`dict[str, asyncio.Lock]`) eliminates cross-session head-of-line blocking under concurrent
  multi-user load in a shared Databricks App worker process.
- **Memory safety (`IMP-18`, `IMP-02`):** Removing the unbounded `window.__m` global array eliminates
  long-session browser memory leaks; capping rendered diff lines at `MAX_DIFF_LINES = 1200` prevents
  DOM layout freezes on giant generated diffs.
- **Zero broken live state:** Inserting a code cell from chat marks the local notebook buffer dirty
  and writes to the existing draft cache without bypassing the workspace write fence or auto-saving.

## L7 — O(n) Algorithmic Complexity Expert lens

| ID | Hot Path | Location | Before | After | Mechanism |
|---|---|---|---|---|---|
| **O1** | Evidence verification | `api/services/agent_work.py` (`observation_proof`) | **O((C + O) × I)** | **O(C + O + I)** | Pre-index completed invocations by `(asset_kind, asset_id)` in a `dict`. |
| **O2** | Tool approval enrichment | `api/services/turn_service.py` (`_drain`) | **O(E × A)** | **O(E)** (O(1)/event) | Maintain `approvals_by_call: dict[call_id, approval_id]` in `live.extra`. |
| **O3** | Outbox flush concurrency | `api/services/work_events.py` (`flush`) | **Global O(S) serial lock** | **O(1) per-session lock** | `dict[session_id, asyncio.Lock]` + clean eviction when idle. |
| **O4** | Storage diagnostics | `api/adapters/durable/agent_postgres.py` (`storage`) | **10 SQL round-trips** | **1 SQL round-trip** | Single static `UNION ALL` query across all 10 allow-listed ledger tables. |
| **O5** | Streaming write-sync effect | `web/src/App.tsx:464-483` | **O(T × C) per delta** | **O(active turn tools)** | Skip already-settled turns tracked in a `Set<string>` ref. |
| **O6** | Mission turn picker | `web/src/components/MissionScreen.tsx:144` | **O(T × tools) per delta** | **O(T) memoized** | Compute turn option labels in `useMemo` without calling full `missionView()` per `<option>`. |
| **O7** | Notebook cell exec map | `web/src/components/NotebookEditor.tsx:411` | **O(N) every render** | **O(N) only on dep change** | Wrap `executionMap(...)` in `useMemo`. |
| **O8** | Unified & split diff parser | `web/src/domain/diff.ts` | N/A (unparsed `<pre>`) | **O(min(L, 1200))** | Single linear pass over lines with early cap and O(k) hunk pairing. |
