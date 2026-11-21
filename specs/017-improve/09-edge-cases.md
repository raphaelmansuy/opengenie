# 09 — Edge-case register & mitigations

[Index](README.md) · Previous: [08 — Expert lenses](08-expert-lenses.md) · Next: [10 — Implementation plan](10-implementation-plan.md)

Every foreseeable edge case across diff rendering, compaction, cell diagnostics, code insertion,
autonomy controls, evidence grading, concurrency, database queries, and responsive theming is listed
below with its statechart guard ([06](06-statecharts.md)), mitigation, and verifying test group
([11](11-tests-traceability.md)).

## Register

| ID | Area | Edge case | Guard / Mitigation | Test |
|---|---|---|---|---|
| **E01** | DiffView | `row.diff` is `""`, whitespace-only, or `undefined` | Render concise empty-diff message; omit Unified/Split/Copy chrome (`SC-1`). | `T01` |
| **E02** | DiffView | Huge diff (> 1,200 lines, e.g. 50k lines generated file) | Stop parsing display rows at `MAX_DIFF_LINES = 1200`; count exact omitted lines; show truncation banner; keep Copy bound to original string (`SC-1`). | `T01` |
| **E03** | DiffView | Narrow viewport (390px mobile) or 380px dock with Split enabled | Split view CSS grid collapses gracefully / scrolls internally inside `.diff-scroll` with zero page horizontal overflow (`scrollWidth <= clientWidth`). | `T13`, `T15` |
| **E04** | DiffView | `navigator.clipboard.writeText` missing or rejects (insecure origin / denied permission) | `try/catch` shows `"Copy unavailable"` inline feedback; never throws unhandled rejection (`SC-1`). | `T01` |
| **E05** | DiffView | Non-standard diff lacking `@@ -a,b +c,d @@` headers or containing `\r\n` CRLF | Normalize `\r\n` -> `\n`; initialize counters at 1 so `+`/`-`/context lines still render cleanly with valid line numbers. | `T01` |
| **E06** | Compaction | User clicks Compact or types `/compact` while a turn is actively streaming | Disable Compact button while `running === true`; `/compact` displays inline guidance without calling `POST /compact` (`SC-2`). | `T03`, `T08` |
| **E07** | Compaction | User double-clicks Compact rapidly | In-flight `compacting` flag guards re-entry until request resolves (`SC-2`). | `T03` |
| **E08** | Compaction / Meter | `contextWindow` is `0`, `undefined`, or negative; or `input` tokens is `0` | `contextMeterState` returns `tone: "unknown"`, `percent: null`, `cacheHitRate: null` — zero `NaN`/`Infinity`. | `T03` |
| **E09** | Compaction | Server returns `{ changed: false, reason: "nothing needs shedding" }` | Render honest neutral notice ("Already compact — nothing needed shedding") without fabricating a compaction card (`SC-2`). | `T03`, `T08` |
| **E10** | Compaction | `POST /compact` fails (500 / offline / 409) | Surface concise error banner inline in meter; reset `compacting = false` so user can retry (`SC-2`). | `T03` |
| **E11** | Compaction | SSE reconnect replays the same `session.compacted` event twice | `patchCompaction` matches existing `compactionId` and updates in place (idempotent upsert, zero duplicates). | `T02` |
| **E12** | Compaction | Legacy ACP event without `compactionId` AND without server plan fields (`{status: "completed"}`) | `patchCompaction` preserves exact existing contract and returns the same `rows` reference unchanged. | `T02` |
| **E13** | CellError | Failed cell has empty/null error string | `classifyCellError` falls back to `{ kind: "runtime", label: "Execution error", tone: "danger" }`. | `T05` |
| **E14** | CellError | Stack trace is 20KB long | `diagnosePrompt` and `fixPrompt` trim error excerpt to <= 600 characters while keeping the first actionable line intact. | `T05` |
| **E15** | CellError | Cell rendered in read-only mode (no `onFix` / `onDiagnose` callback) | Error classification pill still renders for clarity, while action buttons are omitted cleanly (`SC-3`). | `T05` |
| **E16** | CellError | Error contains HTML/script-like angle brackets (`<script>`, `STRUCT<a:STRING>`) | Rendered strictly via React text nodes (never `dangerouslySetInnerHTML`); zero XSS risk. | `T05` |
| **E17** | Autonomy Bar | `PATCH /api/sessions/{sid}/work` fails when switching mode | Catch rejection, keep select aligned to server-confirmed mode, surface error alert (`SC-4`). | `T04` |
| **E18** | Tools Popover | User presses `Escape` or clicks outside the Active Tools popover | Popover closes cleanly and returns focus cleanly; clicking inside popover does not dismiss it (`SC-4`). | `T04` |
| **E19** | Insert Cell | No notebook is open (Mission overview, Query tab, or plain text file) | `InsertNotebookCell` context is `null`; Markdown code block omits the `Insert cell` button cleanly (`SC-5`). | `T06` |
| **E20** | Insert Cell | Active notebook is read-only (`outsideFolder` or `editable === false`) | `InsertNotebookCell` is not registered for non-writable notebooks; button stays hidden (`SC-5`). | `T06` |
| **E21** | Insert Cell | Code block has unknown/unusual fence language (`pyspark`, `bash`, `json`, or empty) | Map `python`/`py`/`pyspark` -> `python`, `sql`/`sparksql` -> `sql`, `scala` -> `scala`, `r` -> `r`, `md`/`markdown` -> `markdown`, fallback -> notebook's default language. | `T06` |
| **E22** | Insert Cell | User clicks `Insert cell` while notebook has unsaved edits | Appends new cell to `liveCells` in place, preserves all unsaved edits in existing cells, marks dirty, and schedules local draft save. | `T06`, `T15` |
| **E23** | Follow-ups | Turn mixes V1 and V2 tool names or includes failed + succeeded calls | `followups.ts` checks V1+V2 patterns, prioritizes pending/failed recovery, deduplicates labels, and caps at 3 chips. | `T07` |
| **E24** | Slash Commands | User submits `/compact` with trailing whitespace or uppercase `/COMPACT` | Case-insensitive match triggers compaction directly instead of sending literal `"/compact"` to the LLM. | `T07`, `T14` |
| **E25** | Evidence Pills | Evidence row has unknown or missing `grade` (legacy V1 journal) | Gracefully derive `"verified"` vs `"unverified"` from `verified` boolean; never render `undefined`. | `T06` |
| **E26** | Evidence Pills | Evidence row has `grade: "contradicted"` with `reason` | Highlight with pastel rose pill (`Contradicted`) and surface `reason` inline directly under the row. | `T06`, `T14` |
| **E27** | Backend Lock | Two sessions call `WorkEvents.flush(sid1)` and `WorkEvents.flush(sid2)` concurrently | Each session acquires its own lock and progresses in parallel without blocking the other (`IMP-13`). | `T09` |
| **E28** | Backend Lock | Global `WorkEvents.flush(None)` runs while a session lock is active | Drains cleanly per distinct session key found in outbox, acquiring each session's lock in deterministic sorted order (deadlock-free). | `T09` |
| **E29** | Observation Proof | 200 changes + 500 invocations in one turn, some without `asset` or non-completed | O(C + O + I) index ignores non-completed/missing-asset invocations and matches valid `(kind, id)` pairs identically to legacy semantics. | `T10` |
| **E30** | Approval Index | `tool_call.updated` arrives for unknown `callId` or after approval was already decided | O(1) lookup misses cleanly with zero exceptions and falls back safely. | `T11` |
| **E31** | Postgres Storage | Some ledger tables are empty (`0` rows, `SUM` returns `NULL`) | `COALESCE(SUM(octet_length(body)), 0)` per `UNION ALL` branch returns `0` integers for all 10 entity kinds consistently. | `T12` |
| **E32** | Theme Contrast | Both Light and Dark modes rendered across desktop and mobile | All new components (`DiffView`, `AgentMeter`, `WorkComposerBar`, `CellOutput`, evidence badges) use theme tokens with WCAG AA text contrast and zero hardcoded light-only backgrounds in dark mode. | `T13`–`T15` |
