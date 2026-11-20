# Runtime and data design

The [product contract](interaction.md#acceptance-contract) treats a folder choice as a draft until a message starts a session. The [implementation plan](plan.md) identifies the owners of each transition.

## Selection and first send

```mermaid
%%{init: {"theme":"base","themeVariables":{"actorBkg":"#e4edfc","actorTextColor":"#23324d","actorBorder":"#899dc1","signalColor":"#55627a","noteBkgColor":"#fff1d6","noteTextColor":"#413624","labelBoxBkgColor":"#eee6fa","activationBkgColor":"#dff2e8"}}}%%
sequenceDiagram
    actor U as Developer
    participant P as Folder picker
    participant A as App API
    participant W as Workspace
    participant S as Session service
    U->>P: Browse or enter a path
    P->>A: Check selected path
    A->>W: Get object status with caller token
    W-->>A: Directory, repo, absent or error
    A-->>P: Canonical candidate or failure
    opt Typed path is absent
        P-->>U: Explain future folder
        U->>P: Confirm future folder
        P->>A: Recheck candidate
    end
    P-->>U: Show confirmed choice
    U->>A: Send first mission
    A->>S: Create session with selected folder
    S->>S: Record session.created and bind tool scope
    Note over S,W: Each actual workspace operation still requires platform authorization
```

The workspace browser checks object metadata through the existing caller-token adapter. A positive result identifies a directory or repo. Existence and access can change after the check. Each later operation resolves its target under the session fence and Databricks checks its permissions at execution. See the [API route](../../apps/coding-agent/api/routers/api.py) and [workspace adapter](../../apps/coding-agent/api/adapters/databricks/workspace.py).

## Session and workspace data

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#e4edf9","primaryBorderColor":"#93a6bd","primaryTextColor":"#223047","tertiaryColor":"#f0e8fa","lineColor":"#6c798b","attributeBackgroundColorOdd":"#f0f7f4","attributeBackgroundColorEven":"#faf7ef"}}}%%
erDiagram
    USER ||--o{ SESSION : owns
    SESSION ||--|{ SESSION_EVENT : records
    SESSION ||--o| TOOL_PROCESS : provisions
    USER {
        string id PK
    }
    SESSION {
        string id PK
        string user_id FK
        string folder
        string write_mode
    }
    SESSION_EVENT {
        string session_id FK
        string type
        json payload
    }
    TOOL_PROCESS {
        string session_id FK
        string folder_prefix
    }
```

This is a logical model. The process is ephemeral. The existing session-created event persists the folder and supports replay. Browser selection is scoped to the current account and workspace for this page lifetime. Reloading a saved session reads its recorded path. A fresh home page starts from the signed-in user’s scratch folder. Picking again requires no schema migration or update of earlier journal rows. See [session creation and recovery](../../apps/coding-agent/api/services/session_service.py) and [runtime provisioning](../../apps/coding-agent/api/services/provisioning.py).

## State transitions

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#e8edfb","primaryBorderColor":"#94a1be","primaryTextColor":"#273449","lineColor":"#6d7990"}}}%%
stateDiagram-v2
    [*] --> Closed
    Closed --> Exploring: Open picker
    Exploring --> Checking: Confirm candidate
    Checking --> Error: Denied or invalid or unavailable
    Checking --> Future: Typed path missing
    Future --> Checking: Explicit confirmation
    Future --> Exploring: Edit
    Error --> Exploring: Edit or browse
    Error --> Checking: Retry
    Checking --> Prepared: Accepted
    Exploring --> Closed: Cancel or Escape
    Checking --> Closed: Cancel in flight
    Future --> Closed: Cancel
    Error --> Closed: Cancel
    Prepared --> Bound: First mission
    Bound --> Exploring: Choose another folder
    classDef neutral fill:#e9eefb,stroke:#8a9cbc,color:#23324b
    classDef review fill:#fff0d6,stroke:#b19a6d,color:#42331c
    classDef issue fill:#f9e4e7,stroke:#be8794,color:#4f2f39
    classDef done fill:#dff2e8,stroke:#85aa97,color:#223b30
    class Exploring,Closed neutral
    class Checking,Future review
    class Error issue
    class Prepared,Bound done
```

Cancellation aborts the metadata request. A listing belongs to one location and query. Replacing it unmounts the earlier request, so stale results cannot become actionable. A submitted mission holds its start lock while the session handoff completes. The [E2E matrix](e2e/README.md) exercises the user-visible transitions.

## Complexity

Browsing requests one level with N direct children. Folder filtering and rendering cost O(N), and the existing adapter orders a directory in O(N log N). Typing a path costs O(L) for path length L and a constant number of status calls per confirmation. A 280 ms debounce precedes search. The existing breadth-first search caps depth at 4, visited directories at 120, results at 40 and checks an eight-second deadline between batches. An upstream request can outlast that deadline. Directory fan-out still affects payload size and DOM cost. No recursive client-side folder index or workspace-wide persistent cache is introduced.
