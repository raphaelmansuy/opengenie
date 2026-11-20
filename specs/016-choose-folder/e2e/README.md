# Verification and visual evidence

The [browser journey](../../../apps/coding-agent/web/scripts/folder-e2e.mjs) passed against the production web build, FastAPI routes, Databricks HTTP adapter and a disposable SQLite journal. A loopback HTTP fixture serves workspace metadata. A deterministic agent receives the mission. Live Databricks identity, warehouse state, ACL configuration and provider execution were unavailable for this run.

## Acceptance matrix

| Contract | Case exercised | Assertion |
|---|---|---|
| F1 | Home, Mission overview, Account, Files tree and Files list context menu | Each opens the same modal. Files passes the selected path. Account shows the reopened session’s folder. |
| F2 | Locations, deep navigation, empty folder, current-folder shortcut, back, failed listing and retry | A directory opens one level. File leaves are omitted. Retry restores the listing. The current folder cannot be redundantly committed. |
| F2 | Short query, zero results, duplicate names, bounded search | A one-character query shows guidance. Full paths disambiguate two Forecasts directories. Forty returned matches display a partial-results notice. |
| F3 | Confirm a browsed project, paste a workspace alias and select a Git folder | The API records the canonical folder. Browsing and confirming alone allocate zero sessions. |
| F3, F5 | Root, relative input, oversize paste, file, vanished folder, denied path | Root and oversize choices cannot commit. A direct invalid creation receives 422. Known files and disappeared browse targets show errors. A 403 leaves the old folder in effect. |
| F3, F5 | Type a future path, edit it and later confirm a future path containing Unicode and a comma | The second action names the future folder. Editing clears that confirmation. Choosing creates no workspace object or session. |
| F4 | Switch while viewing the first mission, send again and reload the earlier session | Two distinct session IDs retain their paths. The real fence endpoint allows each session’s own child and asks for its sibling-prefix and other-session paths. |
| F5 | Escape after navigation or retry, cancel a failed lookup and cancel while a real metadata response is held | Focus returns to the launcher. The request lock disables a second submission. A delayed answer cannot commit the cancelled choice. |
| F6 | Light desktop at 1360 × 900 and dark mobile at 390 × 844 | Dialog fits the viewport, its contents have no horizontal overflow and the actions are visible. |
| Runtime | Canonical spellings, 512-character boundary, control characters, dot segments, relative paths, ambiguous aliases and a comma in a process folder | The Python tests exercise the same validation and environment used by session creation and the tool server. Existing scope, editor-write and write-mode tests also pass. |

The full web unit suite passed **1,292 tests**. The focused Python run passed **81 tests**. The feature suite builds TypeScript and Vite before starting Chromium. See the [runtime design](../architecture.md), [contract](../interaction.md) and [implementation plan](../plan.md).

## Visual review

All five final PNGs were opened and inspected. The initial browse view moved vertically when navigating to a shorter listing. Reserving three rows kept the primary action in place. Path text was enlarged and the current folder gained a direct Open action. In the initial denied state, the proposed path appeared twice and confirmation still looked available. The revised view keeps the original folder visible, associates the denial with the input and disables the rejected action.

| Screenshot | Final observation |
|---|---|
| [Workspace locations](screenshots/01-workspace-locations.png) | The home path, named locations and search field are legible. Selection is disabled until a different folder is chosen. |
| [Project selection](screenshots/02-project-selection.png) | The navigation path and selected folder agree. The footer stays aligned with the locations view. |
| [Permission denied](screenshots/03-permission-denied.png) | The rejected destination and reason sit together. The current authorized path remains visible below. |
| [Mobile session switch](screenshots/04-new-conversation-mobile-dark.png) | The input, current folder and complete new-conversation action label fit at phone width. Keyboard focus is visible against the dark surface. |
| [Confirmed home screen](screenshots/05-confirmed-working-folder.png) | The folder card and confirmation show the same destination before the first message. Change remains visible. |

## Reproduce

From the repository root, with the app's Python environment, web dependencies and Playwright Chromium installed, run the following commands. The E2E suite needs permission to bind loopback ports. Screenshots are regenerated in this directory's screenshots subfolder.

```sh
npm --prefix apps/coding-agent/web run e2e:folder
npm --prefix apps/coding-agent/web test
cd apps/coding-agent
.venv/bin/python -m pytest -q tests/test_folder_selection.py tests/test_fence_parity.py tests/test_workspace_write.py tests/test_write_mode.py
```
