# My TODOs

A simple, workspace-scoped TODO list for VS Code. Each workspace gets its own independent TODO list stored locally.

## Features

- **Workspace-scoped** — each VS Code workspace has its own TODO list
- **Groups** — organize TODOs into named groups with drag-and-drop reordering
- **Inline editing** — double-click any TODO to edit it in place
- **Completed archive** — completed items are archived for 7 days then auto-cleaned
- **MCP server** — AI agents (like Claude Code) can read and manage your TODOs via the Model Context Protocol

## MCP Integration

My TODOs includes a built-in MCP server that lets AI coding agents interact with your TODO list. On first activation, the extension will ask to register itself in your global `~/.claude.json` config.

### Available MCP Tools

| Tool | Description |
|---|---|
| `list_todos` | List active TODOs, optionally filtered by group |
| `list_completed_todos` | List completed/archived TODOs |
| `add_todo` | Add one or more TODOs |
| `complete_todo` | Mark TODOs as completed |
| `uncomplete_todo` | Restore completed TODOs back to active |
| `delete_todo` | Permanently delete TODOs |
| `edit_todo` | Edit TODO text |
| `move_todo` | Move TODOs between groups |
| `list_groups` | List all groups |
| `add_group` | Create a new group |
| `rename_group` | Rename a group |
| `delete_group` | Delete a group (TODOs move to default) |

All mutation tools support batch operations (1..N items per call) and accept either `id` or `text_match` for targeting specific TODOs.

## Settings

| Setting | Default | Description |
|---|---|---|
| `mytodos.mcpAutoRegister` | `ask` | Whether to auto-register the MCP server (`enabled`, `disabled`, `ask`) |
