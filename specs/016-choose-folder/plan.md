# Implementation and verification plan

Start with the [five whys](README.md) and [F1–F6](interaction.md#acceptance-contract). The [state chart](architecture.md#state-transitions) defines when a choice can affect the next mission.

| Lens | Decision and implementation step | Completion check |
|---|---|---|
| Product owner | Give all four entry points the same choice. Disclose the new conversation before committing an active-session change. | F1, F4. Switch and reopen the original session. |
| UX designer | Separate navigating, confirming and sending. Preserve every recoverable error on the same screen, with Cancel always available. | F2, F3, F5. Walk the error and cancellation paths. |
| UI designer | Use the existing theme, icon family and primary button. Put the full candidate directly above the action. Allow wrapping and modal scrolling. | F6. Inspect desktop light and narrow dark captures. |
| Full stack developer | Route Home, Mission, Account and Files through the shell’s chooser. Reuse the typed HTTP client, resource lifecycle and existing first-send path. | F1–F5. Check the real POST, response and folder after reload. |
| Database expert | Store the folder once with session creation. Preserve event replay and owner checks. A UI selection alone allocates zero sessions. | F3, F4. Count sessions before sending and compare both saved rows after switching. |
| AI engineer | Bind the confirmed path to the tool process as one value, including commas and Unicode. Continue using the existing target policy and session instructions. | F3, F4. Check the process environment and inside/outside decisions. |
| System design expert | Keep Databricks ACLs authoritative. Verify directory type using a read-only status call. Retain old session IDs, processes, approvals and pending turns under their initial scopes. | F4, F5. Check denial, transport failure and independent fences. |
| Algorithm reviewer | Load one folder per navigation and bound name search. Discard obsolete requests. Keep the directory ordering in the existing adapter. | F2. See [costs and bounds](architecture.md#complexity). |

## Delivery order and code ownership

1. **Folder contract.** Centralize submitted-path validation and canonicalization in [fence rules](../../apps/coding-agent/api/domain/fence_rules.py). Reuse it for the preview and session POST. The exact root sentinel on direct legacy session creation continues to denote no writable folder.
2. **Runtime.** Pass a single session folder through the [process registry](../../apps/coding-agent/api/adapters/mcp/registry.py). The [tool server](../../apps/coding-agent/tools/databricks_notebook_mcp.py) also supports its existing standalone multi-path configuration.
3. **Interaction.** The [picker](../../apps/coding-agent/web/src/components/FolderPicker.tsx) owns candidate, listing and feedback. The [shell](../../apps/coding-agent/web/src/App.tsx) owns the committed choice, focus context and session transition. The picker receives callbacks and has no session-store dependency.
4. **Verification.** Run the [path and tool tests](../../apps/coding-agent/tests/test_folder_selection.py) and the [browser journey](../../apps/coding-agent/web/scripts/folder-e2e.mjs). Inspect each screenshot, adjust layout and interaction, then recapture. The [evidence index](e2e/README.md) records the results.

These boundaries apply DRY to validation, catalog browsing and first send. They apply single responsibility to the picker, API, session service and tool registry. Adding a new picker entry point calls the existing shell action. Substituting a workspace backend uses the same browser adapter contract.
