# Product and interaction specification

The unit of authorization is one conversation. A developer may browse a team project, paste a workspace path or pick a Git folder from Files. The first mission should run with the folder they confirmed. See the [five whys](README.md), [runtime sequence](architecture.md#selection-and-first-send) and [test matrix](e2e/README.md).

## Acceptance contract

| ID | User outcome | Observable contract |
|---|---|---|
| F1 | Find the setting while working | Home shows the current path and Change. Mission overview offers Change folder. Account opens the picker from a document. Files can open it with a candidate selected. |
| F2 | Explore before deciding | Browse locations, open one directory at a time, go back, refresh or search by name. Show full paths for duplicate names. Show a current marker, loading, empty, incomplete-search and retry states. |
| F3 | Choose a precise destination | Review the selected path and press Use this folder. A metadata lookup verifies the type. A typed, missing path requires a second explicit confirmation. Folder selection creates no workspace object. |
| F4 | Change projects during a conversation | The action reads Use for new conversation. Confirming prepares the next conversation. The first send records its folder. The earlier session and its in-flight work retain their original scope. |
| F5 | Recover or back out | Cancel and Escape discard the draft and return focus. An invalid path, file, permission denial or service failure keeps the dialog open. Editing the path clears its previous result. |
| F6 | Read and operate it at different sizes | The dialog uses native modal focus containment, visible text labels and button states. Long paths wrap, the list scrolls independently and the outer dialog scrolls on short screens. |

## Navigation wireframe

```ascii
Home / Change -------------------+
Mission / Change folder ---------+
Account / Change working folder -+--> Choose a working folder
Files / Work in folder ----------+           |
                                             +--> Browse or enter path
                                             |          |
                                             |          v
                                             |       Confirm --> Home or document
                                             |                        |
                                             +--> Cancel              v
                                                  or Esc          First send
                                                     |                |
                                                     v                v
                                                  Original         Session with
                                                  screen           chosen folder
```

## Screen wireframe

```ascii
+---------------------------------------------------+
| Choose a working folder                           |
| Choose where the agent can write workspace files. |
|                                                   |
| [ Browse folders          ][ Enter a path      ]  |
| [ Search in this folder...                     ]  |
| <  /Shared/Analytics                     Refresh  |
| +----------------------------------------------+  |
| | Forecasts                                  > |  |
| | /Shared/Analytics/Forecasts                  |  |
| +----------------------------------------------+  |
| | Monthly reporting                          > |  |
| | /Shared/Analytics/Monthly reporting          |  |
| +----------------------------------------------+  |
| Selected folder                                   |
| /Shared/Analytics                                 |
|                         [Cancel] [Use this folder]|
+---------------------------------------------------+
```

A pointer click or keyboard activation opens a row. Back returns to the previous visited location, including the results-to-folder route back to its search scope. The current-folder Open action jumps directly to a deep path. The lock and path label describe the candidate. The active session’s write mode and platform permissions still apply. See [enforcement](architecture.md#session-and-workspace-data) and the [reviewed screens](e2e/README.md#visual-review).
