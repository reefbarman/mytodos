# My Dev Notes

A VS Code sidebar extension for managing workspace-scoped TODOs and scratch pad notes, with MCP server integration for AI agents.

## Features

- **TODOs** — Add, edit, check off, snooze, pin as current task, and drag-reorder tasks. Organize with named groups.
- **Project + Global scopes** — Keep project-specific work separate from global notes that are visible in every workspace.
- **Notes** — Markdown scratch pad notes. Write in markdown, see rendered output. Double-click to edit.
- **Search + tags** — Filter TODOs and notes from the sidebar. Add `#tags` in TODO text and click tag chips to filter.
- **Groups** — Create named groups to organize TODOs. Drag to reorder groups.
- **Archive** — Completed TODOs are archived for 7 days, then auto-cleaned.
- **Collapsible sections** — Collapse TODOs, Notes, and individual groups.
- **MCP Server** — AI agents (e.g. Claude Code) can read and manage your TODOs and notes across project/global scopes.

## Installation

### VS Code Extension

1. Clone the repo and install dependencies:

   ```sh
   git clone https://github.com/reefbarman/mydevnotes.git
   cd mydevnotes
   npm install
   ```

2. Build the extension:

   ```sh
   npm run compile
   npm run bundle:mcp
   npm run bundle:webview
   ```

3. Install locally in VS Code — either:
   - Open the repo in VS Code, press `F5` to launch the Extension Development Host, or
   - Package and install the `.vsix`:

     ```sh
     npx @vscode/vsce package
     code --install-extension mydevnotes-*.vsix
     ```

4. The "My Dev Notes" icon will appear in the activity bar sidebar.

### MCP Server (for AI agents)

The extension can auto-register its MCP server with Claude Code. On first activation you'll be prompted to enable this. If you choose "Enable", it writes the following to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mydevnotes": {
      "command": "node",
      "args": ["/path/to/extension/out/mcp-server.js"]
    }
  }
}
```

To register manually, add the above to your `~/.claude.json` (updating the path to point to the installed extension's `out/mcp-server.js`).

The MCP server uses `process.cwd()` to determine which workspace's data to read/write, so it works automatically when Claude Code sets the working directory to your project root.

You can control auto-registration via the `mydevnotes.mcpAutoRegister` setting (see Configuration below).

## MCP Tools

### TODO Tools

| Tool                   | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `list_todos`           | List active TODOs (optional scope, group, tag, and snoozed filters) |
| `list_completed_todos` | List completed TODOs                                                |
| `add_todo`             | Add one or more TODOs                                               |
| `complete_todo`        | Mark TODOs as completed                                             |
| `uncomplete_todo`      | Restore completed TODOs                                             |
| `delete_todo`          | Permanently delete TODOs                                            |
| `edit_todo`            | Edit TODO text                                                      |
| `move_todo`            | Move TODOs between groups                                           |
| `snooze_todo`          | Snooze TODOs until an epoch-ms or parseable date string             |
| `unsnooze_todo`        | Wake snoozed TODOs now                                              |
| `set_current_task`     | Pin or clear the current project task                               |
| `get_current_task`     | Show the current project task                                       |
| `list_groups`          | List all groups                                                     |
| `add_group`            | Create a new group                                                  |
| `rename_group`         | Rename a group                                                      |
| `delete_group`         | Delete a group                                                      |

### Note Tools

| Tool          | Description                    |
| ------------- | ------------------------------ |
| `list_notes`  | List all notes with preview    |
| `add_note`    | Add a note (supports markdown) |
| `edit_note`   | Edit note content              |
| `delete_note` | Delete a note                  |

Most MCP tools accept an optional `scope` parameter: `"project"` (default, keyed by `process.cwd()`) or `"global"` (shared everywhere). `set_current_task` and `get_current_task` are project-only.

Embedded images are returned as MCP image content by `list_todos`, `list_completed_todos`, `get_current_task`, and `list_notes`. Their inline data URLs are replaced with compact `attachment:img-N` Markdown references in the text response.

## Configuration

| Setting                      | Description                                             | Default |
| ---------------------------- | ------------------------------------------------------- | ------- |
| `mydevnotes.mcpAutoRegister` | Auto-register MCP server (`enabled`, `disabled`, `ask`) | `ask`   |

## Data Storage

State is stored in `~/.mydevnotes/data.json`, keyed by workspace path. Global items use the reserved key `::global::`. This keeps your project directories clean — no per-project config files or `.gitignore` entries needed.

Current schema version is 3. Older extension/MCP versions can read the file shape but will not understand snoozed TODO behavior or current-task clearing rules.
