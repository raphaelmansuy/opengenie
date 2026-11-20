# Five whys

1. **Why choose a folder?** A developer wants the agent to edit the project they are looking at.
2. **Why show the full path?** Two projects can share a directory name.
3. **Why ask for a deliberate choice?** Opening a directory to explore it should carry no authority to write.
4. **Why explain the session boundary?** The tool process receives its workspace fence when the session starts. A running turn can outlive the browser view.
5. **Why preserve the old session?** A reviewer needs to know which folder applied to each request, approval and resulting change.

## First principles

A folder is a workspace path. A person chooses it, a session records it, and the tool layer checks each write. Databricks still checks the caller's permissions. Looking at a folder, attaching it as context and allowing an agent to write there are three separate actions.

Read the [product and interaction specification](interaction.md), [runtime and data design](architecture.md), [implementation plan](plan.md) and [acceptance evidence](e2e/README.md) together. Requirement identifiers connect the screens, implementation steps and checks.
