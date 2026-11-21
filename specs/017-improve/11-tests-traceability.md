# 11 — Tests, traceability & visual verification log

[Index](README.md) · Previous: [10 — Implementation plan](10-implementation-plan.md)

## Requirement & edge-case traceability matrix

| Test ID | Suite | Location | Requirements | Edge cases |
|---|---|---|---|---|
| **T01** | Vitest unit | `web/src/domain/diff.test.ts` | `IMP-01`, `IMP-02` | `E01`, `E02`, `E04`, `E05` |
| **T02** | Vitest unit | `web/src/domain/agentupdates.test.ts` | `IMP-03` | `E11`, `E12` |
| **T03** | Vitest unit | `web/src/domain/contextmeter.test.ts` | `IMP-04`, `IMP-05` | `E06`, `E07`, `E08`, `E09`, `E10` |
| **T04** | Vitest component | `web/src/components/Improve017.test.tsx` | `IMP-06`, `IMP-07` | `E17`, `E18` |
| **T05** | Vitest unit + component | `web/src/domain/cellerror.test.ts`, `CellPrompt.test.tsx` | `IMP-08` | `E13`, `E14`, `E15`, `E16` |
| **T06** | Vitest component | `web/src/components/Improve017.test.tsx` | `IMP-09`, `IMP-12`, `IMP-17`, `IMP-18` | `E19`, `E20`, `E21`, `E22`, `E25`, `E26` |
| **T07** | Vitest unit | `web/src/domain/followups.test.ts`, `commands.test.ts` | `IMP-10`, `IMP-11` | `E23`, `E24` |
| **T08** | Pytest integration | `tests/test_improve_017.py` | `IMP-03`, `IMP-05` | `E09`, `E11` |
| **T09** | Pytest concurrency | `tests/test_improve_017.py` | `IMP-13` | `E27`, `E28` |
| **T10** | Pytest perf/unit | `tests/test_improve_017.py` | `IMP-14` | `E29` |
| **T11** | Pytest unit | `tests/test_improve_017.py` | `IMP-15` | `E30` |
| **T12** | Pytest SQL/unit | `tests/test_improve_017.py` | `IMP-16` | `E31` |
| **T13** | Playwright E2E | `web/scripts/improve-017-e2e.mjs` | `IMP-01`, `IMP-02`, `IMP-06`, `IMP-07` | `E03`, `E32` |
| **T14** | Playwright E2E | `web/scripts/improve-017-e2e.mjs` | `IMP-03`–`IMP-05`, `IMP-10`–`IMP-12` | `E09`, `E24`, `E26`, `E32` |
| **T15** | Playwright E2E | `web/scripts/improve-017-e2e.mjs` | `IMP-08`, `IMP-09` | `E03`, `E22`, `E32` |
| **T16** | Build & regression | `make check` (`tsc`, `ruff`, `pytest`, `vitest`) | `IMP-01`–`IMP-18` | All |

## Playwright E2E screenshot catalog (`specs/017-improve/e2e/screenshots/`)

| # | Screenshot file | Viewport & theme | Surface verified |
|---|---|---|---|
| 1 | `01-desktop-light-diff-unified.png` | 1360×900 Light | Pending `ChangeCard` with Unified structured diff, `+N/-M` stats, Autonomy bar, Context meter |
| 2 | `02-desktop-light-diff-split-tools.png` | 1360×900 Light | Side-by-side Split diff view + open Active Tools & Fence popover |
| 3 | `03-desktop-light-evidence-compaction.png` | 1360×900 Light | Surfaced evidence grade pills (`Verified` / `Contradicted`), V2 follow-up chips, `/compact` feedback & compaction card |
| 4 | `04-desktop-light-cell-diagnose-insert.png` | 1360×900 Light | Notebook editor with failed cell error badge (`Missing table or column`), `Diagnose error` & `Fix with agent` buttons, and `Insert cell` button on assistant code block |
| 5 | `05-desktop-dark-diff-and-meter.png` | 1360×900 Dark | Dark theme contrast across DiffView, Autonomy bar, Context pressure meter, and Evidence pills |
| 6 | `06-mobile-narrow-dark.png` | 390×844 Dark | Narrow/mobile viewport with zero horizontal overflow, responsive diff box, and clean composer controls |

## Verification summary (all green)

- **TypeScript (`tsc`)**: 0 errors
- **Python lint (`ruff`)**: All checks passed
- **Backend tests (`pytest`)**: 2,378 passed, 40 skipped (includes `tests/test_improve_017.py`)
- **Frontend tests (`vitest`)**: 93 test files, 1,297 passed (includes `diff.test.ts`, `contextmeter.test.ts`, `cellerror.test.ts`, `Improve017.test.tsx`, plus expanded `agentupdates.test.ts`, `followups.test.ts`, `commands.test.ts`)
- **Playwright E2E (`web/scripts/improve-017-e2e.mjs`)**: 6/6 screenshots captured, 0 page errors, 0 horizontal overflow (`scrollWidth <= innerWidth`)
- **Regression E2E (`web/scripts/agent-work-e2e.mjs`)**: 12/12 legacy captures passed
- **Spec link & ASCII hygiene**: `verify-spec-links.mjs` (0 problems), `verify-spec-ascii.mjs` (0 problems)

## Visual inspection & iterative polish log

Every PNG in `specs/017-improve/e2e/screenshots/` was opened and visually inspected across 3 iterations:

- **Iteration 1 (Initial E2E capture & defect discovery):**
  1. Typing `/compact` + Enter while the slash popup was open inserted `/compact` instead of executing compaction (`Composer.tsx` `pickCommand`). Fixed by routing `isCompactCommand(c.insert)` directly to `runCompact()`.
  2. Visual inspection of `03-desktop-light-evidence-compaction.png` and `04-desktop-light-cell-diagnose-insert.png` caught duplicate compaction feedback banners (`AgentMeter` + `Composer` `sendNotice`) and stale `sendNotice` leaking across session switches. Fixed by unifying feedback into `AgentMeter`'s `compactNotice` and resetting `Composer` notices on `sessionId` change.
  3. Visual inspection of `01`, `02`, `05`, and `06` caught mid-word wrapping on `.work-path` (`reven`/`ue`), mid-word wrapping on the popover folder fence (`agent`/`_scratch`), and `.work-composer-bar` wrapping onto a second ragged line at 340px dock width. Fixed with single-line ellipsis + `title` tooltips and a balanced single-row `WorkComposerBar` (`14 tools` pill with full aria-label/title).
  4. Visual inspection of `04` caught a mocked SSE stale-cursor banner (`session closed`) and `↓ Latest` overlapping the code block; replaced the mock SSE route with a live keepalive local SSE stream and scrolled the transcript cleanly to the tail.
- **Iteration 2 (Post-polish re-capture & inspection):**
  1. Verified `01`–`05` at 10/10 visual polish (single-row autonomy bar, full side-by-side Split diff, single compaction banner, crisp failed SQL cell pill + `Diagnose error` / `Fix with agent` + inserted Cell 4 + `Verified`/`Contradicted` evidence + `Context 80%` / `70% cached` / `Compact`).
  2. Visual inspection of `06-mobile-narrow-dark.png` (390×844) spotted the collapsed mobile textarea placeholder (`max-height: 40px`) clipping line 2 vertically. Fixed in `styles.css` by applying `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` only to the unfocused empty compact mobile textarea, and scrolling `.diff-viewer` into view for the mobile capture.
- **Iteration 3 (Final verification):**
  1. Rebuilt production bundle, re-ran `improve-017-e2e.mjs`, `agent-work-e2e.mjs`, and full `make check`.
  2. Re-inspected `06-mobile-narrow-dark.png`: single-line mobile composer with zero vertical clipping, crisp Unified diff with `+1`/`-1` and aligned line numbers, zero horizontal overflow. All 6 screenshots verified clean.
