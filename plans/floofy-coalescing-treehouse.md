# Plan: Rename mytodos → mydevnotes + Add Notes Feature + Preact Refactor

## Context
The "mytodos" VS Code extension is being renamed to "mydevnotes" to reflect an expanded scope: beyond just TODOs, it will also support scratch pad notes with markdown editing/rendering. The frontend is being refactored from vanilla JS to Preact at the same time. The MCP server is also renamed and extended with note tools.

**Storage change**: The state file moves out of the workspace (`.vscode/.mytodos.json`) to a global location: `~/.mydevnotes/data.json`. This single file contains per-workspace data keyed by workspace path. This eliminates the need for `.gitignore` entries and clutter in the project tree.

---

## Phase 1: Rename (mytodos → mydevnotes)

All identifier and string renames across the codebase.

### `package.json`
- `"name": "mytodos"` → `"mydevnotes"`
- `"displayName": "My TODOs"` → `"My Dev Notes"`
- `"description"` → updated to mention TODOs + notes/scratch pad
- `"repository.url"` → update GitHub URL
- `"keywords"` → add `"notes"`, `"scratch pad"`, `"markdown"`
- `"id": "mytodos-sidebar"` → `"mydevnotes-sidebar"`
- `"title": "My TODOs"` → `"My Dev Notes"` (activity bar, view, config, command category)
- `"mytodos-sidebar"` view key → `"mydevnotes-sidebar"`
- `"id": "mytodos.todoView"` → `"mydevnotes.mainView"`
- `"command": "mytodos.addTodo"` → `"mydevnotes.addTodo"`
- `"mytodos.mcpAutoRegister"` → `"mydevnotes.mcpAutoRegister"`
- `"when": "view == mytodos.todoView"` → `"view == mydevnotes.mainView"`
- Icon reference: `"media/todo-icon.svg"` → keep for now (can update icon later)

### `src/extension.ts`
- Import paths: `TodoViewProvider` → `ViewProvider`, `TodoStorageService` → `StorageService`
- `'mytodos.addTodo'` → `'mydevnotes.addTodo'`
- `getConfiguration('mytodos')` → `getConfiguration('mydevnotes')`
- `'My TODOs: Enable MCP server...'` → `'My Dev Notes: Enable MCP server...'`
- `config.mcpServers.mytodos` → `config.mcpServers.mydevnotes`
- Remove `.vscode/.mytodos.json` file path and file watcher — no longer needed
- Storage now uses `~/.mydevnotes/data.json` with workspace path as key
- Pass workspace path to StorageService so it can key into the global file
- Add migration: if old `.vscode/.mytodos.json` exists, import its data into the new global file and delete the old file
- Add migration: clean up old `mytodos` key from `~/.claude.json`

### `src/TodoStorageService.ts` → rename to `src/StorageService.ts`
- Class name: `TodoStorageService` → `StorageService`
- `STORAGE_KEY = 'mytodos.state'` → `'mydevnotes.state'`
- **New storage approach**: Read/write `~/.mydevnotes/data.json` instead of `.vscode/.mydevnotes.json`
  - Global file structure: `{ "<workspace-path>": { todos: [], groups: [], notes: [], schemaVersion: 2 }, ... }`
  - `setFilePath()` replaced with `setWorkspacePath(workspacePath: string)` — computes the global file path and uses workspace path as key
  - Still dual-writes (VS Code Memento + JSON file) for MCP server access
  - File watcher changes: watch `~/.mydevnotes/data.json` instead of workspace-local file
  - `loadFromFile()`: reads only this workspace's entry from the global file
  - `writeToFile()`: reads global file, updates this workspace's entry, writes back
- Add migration: copy old memento key `mytodos.state` → `mydevnotes.state` if new key is empty

### `src/TodoViewProvider.ts` → rename to `src/ViewProvider.ts`
- Class name: `TodoViewProvider` → `ViewProvider`
- `viewType = 'mytodos.todoView'` → `'mydevnotes.mainView'`
- HTML title: `My TODOs` → `My Dev Notes`
- Import path update for StorageService

### `src/types.ts`
- `TodoState` → `AppState` (add `notes` field in Phase 3)
- `WebviewTodoState` → `WebviewState` (add `notes` field in Phase 3)
- Keep `TodoItem`, `TodoGroup` names as-is (they're still conceptually correct)

### `mcp-server.js`
- Comment header updated
- `name: 'mytodos'` → `'mydevnotes'`
- **New storage approach**: `STATE_FILE` replaced with global file logic
  - State file: `~/.mydevnotes/data.json`
  - Uses `process.cwd()` as the workspace key to read/write the correct entry
  - `readState()`: reads global file, returns data for `process.cwd()` key (or default empty state)
  - `writeState()`: reads global file, updates `process.cwd()` entry, writes back

### `README.md`
- Full rewrite for new name and features

### `.gitignore`
- Remove `.vscode/.mytodos.json` entry (no longer needed — state file is outside workspace)

---

## Phase 2: Build Pipeline for Preact Webview

Set up esbuild to bundle a Preact webview alongside the existing TypeScript extension.

### New dependencies (`package.json`)
- `preact` (runtime, ~3KB)
- `marked` (markdown rendering, ~32KB)
- `esbuild` (already present)

### `tsconfig.json` changes
- Add `"jsx": "react-jsx"`, `"jsxImportSource": "preact"` for Preact JSX
- Add `"webview"` directory to compilation scope (separate from `src` or adjust rootDir)

### `package.json` script changes
- Update `"compile"` to build both extension (tsc) and webview (esbuild with JSX)
- Update `"vscode:prepublish"` to include webview bundle
- Add webview esbuild command: bundles `webview/App.tsx` → `out/webview.js` with `jsx: 'automatic'`, `jsxImportSource: 'preact'`

### `src/ViewProvider.ts` (HTML template)
- Replace inline HTML structure with a single `<div id="root"></div>` mount point
- Script src changes from `media/main.js` to `out/webview.js`
- Keep loading `media/reset.css`, `media/vscode.css`, `media/main.css`

### `.vscodeignore`
- Add `webview/**` (source files, not needed in package)

---

## Phase 3: Preact Webview — TODOs (port existing functionality)

Replace `media/main.js` (596 lines of vanilla DOM manipulation) with Preact components.

### New directory: `webview/`
```
webview/
├── App.tsx              — root component, state management, message handling
├── components/
│   ├── SectionHeader.tsx  — collapsible section header (shared by TODOs + Notes)
│   ├── TodoSection.tsx    — ungrouped TODOs section
│   ├── GroupSection.tsx   — a single named group with its TODOs
│   ├── TodoItem.tsx       — individual TODO with checkbox, edit, copy, delete, drag
│   ├── InlineAddInput.tsx — "+ Add TODO" button → inline input
│   ├── ArchiveSection.tsx — completed items (using <details>)
│   └── GroupManagement.tsx — new group input + button
├── hooks/
│   └── useDragAndDrop.ts  — drag-and-drop logic extracted from vanilla JS
└── types.ts               — re-export shared types, add webview-specific types
```

### Component details

**App.tsx** — Root component
- `const vscode = acquireVsCodeApi()` at module level
- `useState` for `currentState: WebviewState | null`
- `useEffect` to listen for `message` events (`stateUpdate`, `focusAddInput`)
- Posts `{ type: 'ready' }` on mount
- Renders: `<TodoSection>`, groups via `<GroupSection>`, `<GroupManagement>`, `<ArchiveSection>`
- Passes `vscode.postMessage` as callback prop to children

**SectionHeader.tsx** — Shared collapsible header
- Props: `title`, `count`, `collapsed`, `onToggle`, optional action buttons
- Renders collapse chevron, title, count badge
- Used by both TODOs and Notes sections

**TodoItem.tsx** — Individual TODO
- Props: `todo`, `onToggle`, `onEdit`, `onDelete`, `onCopy`
- Double-click to edit inline (local `editing` state)
- Draggable with `dragstart`/`dragend` handlers
- Checkbox, text/edit-input, copy button, delete button

**InlineAddInput.tsx** — Add TODO inline
- Props: `groupId`, `onAdd`
- Starts as `"+ Add TODO"` button, becomes input on click
- Enter commits, Escape cancels, blur commits

**TodoSection.tsx** — Ungrouped TODOs
- Renders `SectionHeader` with title "TODOs" + count
- Collapsible (local state, ungrouped wasn't collapsible before — now it is per user request)
- Maps `todos.filter(t => t.groupId === '')` to `<TodoItem>` components
- Includes drop zone + `<InlineAddInput>`

**GroupSection.tsx** — Named group
- Props: `group`, `todos`, callbacks
- Renders `SectionHeader` with group name, rename/delete buttons
- Collapse toggle via `toggleGroupCollapse` message
- Group-level drag-and-drop for reordering groups
- Maps filtered todos to `<TodoItem>` components
- Includes drop zone + `<InlineAddInput>`

**ArchiveSection.tsx** — Completed items
- Uses `<details>` element (same as current)
- Auto-opens when new items appear
- Groups archived items by their original group
- Each item has: checked checkbox (uncheck to restore), strikethrough text, age, delete button

**GroupManagement.tsx** — New group creation
- Input + "+ Group" button
- Enter to submit

**useDragAndDrop hook**
- Manages `draggedTodoId` and `draggedGroupId` state
- `setupDropZone(listEl)` equivalent logic
- `getDragAfterElement` helper for position calculation
- Drop indicator rendering

### Files to delete
- `media/main.js` — fully replaced by Preact components

---

## Phase 4: Notes Data Model + Backend

### `src/types.ts` — New types
```typescript
export interface NoteItem {
  id: string;
  content: string;    // markdown content
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
}

export interface AppState {   // renamed from TodoState
  todos: TodoItem[];
  groups: TodoGroup[];
  notes: NoteItem[];          // NEW
  schemaVersion: number;      // bump to 2
}

export interface WebviewState {  // renamed from WebviewTodoState
  activeTodos: TodoItem[];
  archivedTodos: TodoItem[];
  groups: TodoGroup[];
  notes: NoteItem[];             // NEW
}
```

New message types added to `WebviewToExtensionMessage`:
```typescript
| { type: 'addNote'; content: string }
| { type: 'editNote'; id: string; content: string }
| { type: 'deleteNote'; id: string }
| { type: 'reorderNote'; id: string; newSortOrder: number }
```

### `src/StorageService.ts` — New methods
- `addNote(content: string): void`
- `editNote(id: string, content: string): void`
- `deleteNote(id: string): void`
- `reorderNote(id: string, newSortOrder: number): void`
- Update `getWebviewState()` to include `notes` sorted by `sortOrder`
- Schema migration: if `schemaVersion === 1`, add empty `notes: []` array, bump to 2
- Update `getState()` default to include `notes: []`

### `src/ViewProvider.ts` — Handle new messages
- Add cases for `addNote`, `editNote`, `deleteNote`, `reorderNote` in `handleMessage()`

---

## Phase 5: Notes UI in Preact

### New components

**`webview/components/NotesSection.tsx`**
- Collapsible section using `<SectionHeader>` with title "Notes"
- Maps `notes` to `<NoteItem>` components
- "+ Add Note" button at bottom (similar to InlineAddInput but creates with empty content and enters edit mode)

**`webview/components/NoteItem.tsx`**
- Two modes: **view** and **edit**
- **View mode**: renders `content` as HTML using `marked` (markdown → HTML). Shows edit and delete action buttons on hover.
- **Edit mode**: `<textarea>` with the raw markdown content. Save on blur or Ctrl+Enter. Cancel on Escape. Auto-resizes to fit content.
- Copy button to copy raw markdown
- Delete button
- New notes start in edit mode

### Markdown rendering
- Import `marked` and configure: `{ breaks: true, gfm: true }`
- Render into a `<div class="markdown-content" dangerouslySetInnerHTML={...}>`
- CSS styles for `.markdown-content` using VS Code theme variables (headings, code blocks, lists, links, etc.)

### CSS additions to `media/main.css`
- `.notes-section` — container styles
- `.note-item` — card-like styling similar to `.todo-item`
- `.note-content` / `.markdown-content` — rendered markdown styles
- `.note-edit-textarea` — editing textarea styles
- `.note-action-btn` — hover-to-show action buttons

---

## Phase 6: MCP Server Notes Tools

### `mcp-server.js` — New tools

Add a `findNote` helper (similar pattern to `findTodo`):
```javascript
function findNote(notes, { id, content_match }) {
  if (id) return notes.find(n => n.id === id);
  if (content_match) {
    const lower = content_match.toLowerCase();
    return notes.find(n => n.content.toLowerCase().includes(lower));
  }
  return undefined;
}
```

New tools:
- **`list_notes`** — List all notes (shows truncated preview of content)
- **`add_note`** — Add a note with markdown content. Schema: `{ content: z.string() }`
- **`edit_note`** — Edit note content. Match by `id` or `content_match`. Schema: `{ items: [{ id?, content_match?, new_content }] }`
- **`delete_note`** — Delete a note. Match by `id` or `content_match`. Schema: `{ items: [{ id?, content_match? }] }`

Update `readState()` default to include `notes: []`.

---

## Phase 7: State Migration

Handle existing users upgrading from mytodos to mydevnotes.

### In `src/extension.ts` activate():

1. **Import old workspace file**: If `.vscode/.mytodos.json` exists, read its data, write it into the new `~/.mydevnotes/data.json` under the workspace key, then delete the old file
2. **Memento migration**: If `mydevnotes.state` is empty but `mytodos.state` has data, copy it over
3. **MCP cleanup**: When registering `mydevnotes` in `~/.claude.json`, delete the old `mytodos` key if present

### In `src/StorageService.ts`:

4. **Schema migration**: When loading state with `schemaVersion: 1`, add `notes: []` and set `schemaVersion: 2`

---

## Phase 8: Cleanup

- Delete `media/main.js` (replaced by Preact webview)
- Update `.vscodeignore` to exclude `webview/` source
- Remove `.vscode/.mytodos.json` from `.gitignore` (no workspace state file anymore)
- Update `README.md` with new name, features, and MCP tool list

---

## Files Modified (summary)

| File | Action |
|------|--------|
| `package.json` | Rename IDs, add deps, update scripts |
| `src/extension.ts` | Rename refs, add migration logic |
| `src/TodoStorageService.ts` | Rename to `src/StorageService.ts`, add note methods, schema migration |
| `src/TodoViewProvider.ts` | Rename to `src/ViewProvider.ts`, update HTML template, handle note messages |
| `src/types.ts` | Add `NoteItem`, rename `TodoState`→`AppState`, add note message types |
| `mcp-server.js` | Rename server, update state file path, add 4 note tools |
| `media/main.css` | Add notes section + markdown rendering styles |
| `media/main.js` | DELETE (replaced by Preact) |
| `tsconfig.json` | Add JSX config |
| `.vscodeignore` | Add webview exclusion |
| `.gitignore` | Remove old `.vscode/.mytodos.json` entry |
| `README.md` | Full rewrite |

## Files Created

| File | Purpose |
|------|---------|
| `webview/App.tsx` | Root Preact component |
| `webview/components/SectionHeader.tsx` | Shared collapsible section header |
| `webview/components/TodoSection.tsx` | Ungrouped TODOs |
| `webview/components/GroupSection.tsx` | Named group with TODOs |
| `webview/components/TodoItem.tsx` | Individual TODO item |
| `webview/components/InlineAddInput.tsx` | Inline add TODO button/input |
| `webview/components/ArchiveSection.tsx` | Completed/archived items |
| `webview/components/GroupManagement.tsx` | Group creation input |
| `webview/components/NotesSection.tsx` | Notes section container |
| `webview/components/NoteItem.tsx` | Individual note with markdown view/edit |
| `webview/hooks/useDragAndDrop.ts` | Drag-and-drop logic |

---

## Verification

1. **Build**: `npm run compile` succeeds with no errors
2. **Extension loads**: Sidebar appears with "My Dev Notes" title and icon
3. **TODOs**: All existing TODO functionality works (add, edit, delete, check, drag-reorder, groups, archive)
4. **Notes**: Can add, edit (markdown), view (rendered), delete, reorder notes
5. **Markdown rendering**: Headers, bold, italic, code blocks, lists render correctly in notes
6. **Collapsible sections**: Both TODOs and Notes sections can be collapsed/expanded
7. **MCP server**: All 16 tools work (12 TODO + 4 note tools)
8. **Migration**: Old `.mytodos.json` data carries over seamlessly
9. **Theme compatibility**: UI looks correct in light, dark, and high-contrast themes
10. **Package**: `vsce package` succeeds
