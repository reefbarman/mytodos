# Implementation Plan: Rename mytodos to mydevnotes + Notes Feature + Preact Refactor

## Overview

Three interleaved changes to the VS Code extension:
1. **Rename** everything from `mytodos` to `mydevnotes`
2. **Add Notes feature** -- collapsible section with markdown notes alongside TODOs
3. **Refactor frontend** from vanilla JS to Preact with JSX

---

## Order of Operations

The work is sequenced to avoid broken intermediate states and minimize rework:

| Phase | What                                                      | Why this order                                                                                                                     |
| ----- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Rename all identifiers, files, and references             | Do this first so all new code uses the new names from the start. Avoids writing new Notes code with old names then renaming again. |
| **2** | Update build pipeline for Preact (esbuild webview bundle) | Must be in place before writing any JSX components.                                                                                |
| **3** | Refactor frontend to Preact components (TODOs only)       | Port existing vanilla JS to Preact while functionality is stable and well-understood.                                              |
| **4** | Add Notes data model, storage, and message types          | Backend changes that the Preact frontend will consume.                                                                             |
| **5** | Add Notes UI components in Preact                         | Build on top of the Preact foundation from Phase 3.                                                                                |
| **6** | Add Notes MCP tools                                       | Independent of UI; can be done after the data model is stable.                                                                     |
| **7** | State file migration logic                                | Handle the `.mytodos.json` to `.mydevnotes.json` rename for existing users.                                                        |
| **8** | Final cleanup, README, testing                            | Polish pass.                                                                                                                       |

---

## Phase 1: Rename mytodos to mydevnotes

### 1.1 package.json (`/home/trist/workspace/mytodos/package.json`)

Every occurrence of `mytodos` must change:

| Field                                              | Old                                                  | New                                                                              |
| -------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `name`                                             | `mytodos`                                            | `mydevnotes`                                                                     |
| `displayName`                                      | `My TODOs`                                           | `My Dev Notes`                                                                   |
| `description`                                      | `Workspace-scoped TODO list with groups and archive` | `Workspace-scoped dev notes and TODOs with groups, archive, and MCP integration` |
| `keywords`                                         | `["todo", "task", "productivity", "mcp", "claude"]`  | `["todo", "task", "notes", "productivity", "mcp", "claude"]`                     |
| `contributes.viewsContainers.activitybar[0].id`    | `mytodos-sidebar`                                    | `mydevnotes-sidebar`                                                             |
| `contributes.viewsContainers.activitybar[0].title` | `My TODOs`                                           | `My Dev Notes`                                                                   |
| `contributes.views` key                            | `mytodos-sidebar`                                    | `mydevnotes-sidebar`                                                             |
| `contributes.views.*.id`                           | `mytodos.todoView`                                   | `mydevnotes.mainView`                                                            |
| `contributes.views.*.name`                         | `My TODOs`                                           | `My Dev Notes`                                                                   |
| `contributes.commands[0].command`                  | `mytodos.addTodo`                                    | `mydevnotes.addTodo`                                                             |
| `contributes.commands[0].category`                 | `My TODOs`                                           | `My Dev Notes`                                                                   |
| `contributes.configuration.title`                  | `My TODOs`                                           | `My Dev Notes`                                                                   |
| `contributes.configuration.properties` key         | `mytodos.mcpAutoRegister`                            | `mydevnotes.mcpAutoRegister`                                                     |
| `contributes.menus.view/title[0].command`          | `mytodos.addTodo`                                    | `mydevnotes.addTodo`                                                             |
| `contributes.menus.view/title[0].when`             | `view == mytodos.todoView`                           | `view == mydevnotes.mainView`                                                    |
| `repository.url`                                   | `https://github.com/reefbarman/mytodos`              | `https://github.com/reefbarman/mydevnotes` (or whatever the new repo URL is)     |

### 1.2 Source file renames

| Old path                    | New path                |
| --------------------------- | ----------------------- |
| `src/TodoStorageService.ts` | `src/StorageService.ts` |
| `src/TodoViewProvider.ts`   | `src/ViewProvider.ts`   |

The class names inside these files also change:
- `TodoStorageService` -> `StorageService`
- `TodoViewProvider` -> `ViewProvider`

### 1.3 src/extension.ts (`/home/trist/workspace/mytodos/src/extension.ts`)

Changes needed:
- **Line 5**: `import { TodoViewProvider }` -> `import { ViewProvider }` from `'./ViewProvider'`
- **Line 6**: `import { TodoStorageService }` -> `import { StorageService }` from `'./StorageService'`
- **Line 9**: `new TodoStorageService(...)` -> `new StorageService(...)`
- **Line 14**: `.mytodos.json` -> `.mydevnotes.json`
- **Line 19**: `.vscode/.mytodos.json` -> `.vscode/.mydevnotes.json`
- **Line 45**: `new TodoViewProvider(...)` -> `new ViewProvider(...)`
- **Line 48-49**: `TodoViewProvider.viewType` -> `ViewProvider.viewType`
- **Line 56**: `'mytodos.addTodo'` -> `'mydevnotes.addTodo'`
- **Line 73**: `vscode.workspace.getConfiguration('mytodos')` -> `getConfiguration('mydevnotes')`
- **Line 81**: `'My TODOs: Enable MCP...'` -> `'My Dev Notes: Enable MCP...'`
- **Line 91**: `'mytodos.todoView'` -> (this is handled via `ViewProvider.viewType` static)
- **Line 117**: `config.mcpServers?.mytodos` -> `config.mcpServers?.mydevnotes`
- **Line 122**: `config.mcpServers.mytodos = {...}` -> `config.mcpServers.mydevnotes = {...}`
- Add migration logic to clean up old `config.mcpServers.mytodos` entry (see Phase 7)

### 1.4 src/StorageService.ts (renamed from TodoStorageService.ts)

- **Line 6**: `STORAGE_KEY = 'mytodos.state'` -> `'mydevnotes.state'`
- Class name: `TodoStorageService` -> `StorageService`
- All imports referencing the old names in types.ts stay the same (TodoItem, TodoGroup, etc. -- these are domain types that still make sense)

### 1.5 src/ViewProvider.ts (renamed from TodoViewProvider.ts)

- **Line 2**: import from `'./StorageService'` instead of `'./TodoStorageService'`
- **Line 5-6**: `TodoViewProvider` -> `ViewProvider`, `viewType = 'mytodos.todoView'` -> `'mydevnotes.mainView'`
- **Line 108**: Script URI path changes later when we switch to Preact bundled output (Phase 2)
- **Line 131**: `<title>My TODOs</title>` -> `<title>My Dev Notes</title>`

### 1.6 mcp-server.js (`/home/trist/workspace/mytodos/mcp-server.js`)

- **Line 3**: Comment `My TODOs VS Code Extension` -> `My Dev Notes VS Code Extension`
- **Line 5**: `.vscode/.mytodos.json` -> `.vscode/.mydevnotes.json`
- **Line 16**: `STATE_FILE` path: `.mytodos.json` -> `.mydevnotes.json`
- **Line 91**: Server name `'mytodos'` -> `'mydevnotes'`

### 1.7 .gitignore (`/home/trist/workspace/mytodos/.gitignore`)

- **Line 5**: `.vscode/.mytodos.json` -> `.vscode/.mydevnotes.json`

### 1.8 README.md (`/home/trist/workspace/mytodos/README.md`)

- Title: `My TODOs` -> `My Dev Notes`
- All content references updated to reflect new name and notes feature (full rewrite in Phase 8)

### 1.9 media/main.js -- NOT renamed yet

This file will be **replaced entirely** by the Preact refactor in Phase 3, so we skip renaming its internal references. It continues to work as-is until Phase 3.

---

## Phase 2: Build Pipeline for Preact

### 2.1 Install dependencies

```bash
npm install preact
npm install -D marked @types/marked
```

`preact` is ~3KB gzipped -- ideal for webview. `marked` is ~32KB -- a fast, widely-used markdown parser.

### 2.2 Create esbuild build script

Create a new file: **`/home/trist/workspace/mytodos/build.mjs`**

This replaces the ad-hoc `tsc` + `esbuild` commands in package.json scripts. It handles three bundles:

```javascript
import * as esbuild from 'esbuild';

// Bundle 1: Extension host (TypeScript, Node.js, no JSX)
await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
});

// Bundle 2: Webview (Preact JSX, browser)
await esbuild.build({
  entryPoints: ['webview/app.tsx'],
  bundle: true,
  outfile: 'out/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  jsxImportSource: 'preact',
  jsx: 'automatic',
  sourcemap: true,
});

// Bundle 3: MCP server (CommonJS, Node.js)
await esbuild.build({
  entryPoints: ['mcp-server.js'],
  bundle: true,
  outfile: 'out/mcp-server.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
});
```

### 2.3 Update package.json scripts

```json
"scripts": {
  "build": "node build.mjs",
  "build:watch": "node build.mjs --watch",
  "vscode:prepublish": "node build.mjs --production",
  "compile": "node build.mjs"
}
```

The `build.mjs` script can accept `--watch` and `--production` flags (add `process.argv` parsing).

### 2.4 Update tsconfig.json

Add JSX support for type-checking (even though esbuild does the actual compilation):

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "outDir": "out",
    "rootDir": ".",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  },
  "include": ["src/**/*", "webview/**/*"],
  "exclude": ["node_modules", "media", "out"]
}
```

Note: `rootDir` changes from `"src"` to `"."` since we now have both `src/` and `webview/` directories. However, since esbuild handles the actual bundling and we don't need tsc output, we can set `"noEmit": true` for the webview tsconfig or keep a separate one. **Simpler approach**: keep `rootDir: "src"` for the extension host and use esbuild exclusively for webview (no tsc needed for webview files). tsconfig.json only covers `src/`.

### 2.5 Update ViewProvider.ts HTML generation

Change the script source from `media/main.js` to `out/webview.js`:

```typescript
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(this.extensionUri, 'out', 'webview.js')
);
```

The CSS files (`reset.css`, `vscode.css`, `main.css`) remain in `media/` and are referenced the same way.

Also update the CSP to allow `unsafe-inline` styles for markdown rendered content (or use a style nonce -- the nonce approach is more secure):

```
content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
```

The `'unsafe-inline'` for styles is needed because `marked` output contains inline HTML that may need styling. Alternatively, all markdown styles can be in the main CSS file (preferred -- avoids `unsafe-inline`).

**Decision**: Keep `unsafe-inline` out. All markdown rendering styles go into `main.css` with a `.markdown-content` wrapper class. This is more secure.

### 2.6 Simplify the HTML template body

Replace the current static HTML structure with a single mount point:

```html
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
```

Preact will render everything into `#app`.

### 2.7 Update .vscodeignore

Add webview source to the ignore list (only bundled output ships):
```
webview/**
build.mjs
```

### 2.8 New directory structure

```
/home/trist/workspace/mytodos/
├── webview/                    # NEW directory
│   ├── app.tsx                 # Entry point, mounts Preact app
│   ├── components/
│   │   ├── App.tsx             # Root component, state management
│   │   ├── TodoSection.tsx     # Collapsible TODOs section
│   │   ├── TodoItem.tsx        # Single TODO item
│   │   ├── GroupSection.tsx    # A group with its TODOs
│   │   ├── InlineAddInput.tsx  # The inline "Add TODO" input
│   │   ├── ArchiveSection.tsx  # Completed/archived items
│   │   ├── GroupManagement.tsx # "New group name" input + button
│   │   ├── NotesSection.tsx    # NEW: Collapsible Notes section
│   │   ├── NoteItem.tsx        # NEW: Single note (view/edit modes)
│   │   └── SectionHeader.tsx   # Shared collapsible section header
│   ├── hooks/
│   │   ├── useVSCodeApi.ts     # Hook wrapping acquireVsCodeApi()
│   │   └── useDragAndDrop.ts   # Drag-and-drop logic as a hook
│   ├── lib/
│   │   └── markdown.ts         # marked setup + sanitization
│   └── types.ts                # Re-export or webview-specific types
├── src/                        # Extension host (unchanged structure)
│   ├── extension.ts
│   ├── StorageService.ts
│   ├── ViewProvider.ts
│   └── types.ts
├── media/
│   ├── main.css                # Kept and extended for notes styles
│   ├── reset.css               # Unchanged
│   ├── vscode.css              # Unchanged
│   └── todo-icon.svg           # Consider updating icon
├── mcp-server.js
├── build.mjs                   # NEW
├── package.json
├── tsconfig.json
└── README.md
```

---

## Phase 3: Refactor Frontend to Preact (TODOs only)

Port the existing 596-line vanilla JS (`media/main.js`) into Preact components. The goal is feature parity -- no new features yet.

### 3.1 webview/app.tsx -- Entry point

```tsx
import { h, render } from 'preact';
import { App } from './components/App';

render(<App />, document.getElementById('app')!);
```

### 3.2 webview/hooks/useVSCodeApi.ts

```typescript
// Singleton wrapper for acquireVsCodeApi()
const vscode = acquireVsCodeApi();

export function postMessage(message: any): void {
  vscode.postMessage(message);
}
```

### 3.3 webview/components/App.tsx -- Root component

This is the main orchestrator. It:
- Listens to `message` events from the extension host
- Stores `currentState` in `useState`
- Passes state slices to child components
- Sends `{ type: 'ready' }` on mount via `useEffect`

```tsx
// Pseudocode structure:
function App() {
  const [state, setState] = useState<WebviewTodoState | null>(null);
  
  useEffect(() => {
    const handler = (event) => {
      switch (event.data.type) {
        case 'stateUpdate': setState(event.data.state); break;
        case 'focusAddInput': /* ref-based focus */ break;
      }
    };
    window.addEventListener('message', handler);
    postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!state) return null;
  
  return (
    <div>
      <TodoSection todos={state.activeTodos} groups={state.groups} />
      <GroupManagement />
      <ArchiveSection archived={state.archivedTodos} groups={state.groups} />
    </div>
  );
}
```

### 3.4 webview/components/TodoSection.tsx

Renders the ungrouped TODOs section and all group sections. This replaces `renderUngrouped()` and `renderGroups()` from the vanilla JS.

```tsx
function TodoSection({ todos, groups }) {
  const ungrouped = todos.filter(t => t.groupId === '');
  
  return (
    <>
      <div id="ungrouped-container">
        <SectionHeader title="TODOs" count={ungrouped.length} />
        <div class="group-todo-list todo-list" data-group-id="">
          {ungrouped.sort(bySortOrder).map(t => <TodoItem key={t.id} todo={t} />)}
          <InlineAddInput groupId="" />
        </div>
      </div>
      <div id="groups-container">
        {groups.sort(bySortOrder).map(g => (
          <GroupSection key={g.id} group={g} todos={todos.filter(t => t.groupId === g.id)} />
        ))}
      </div>
    </>
  );
}
```

### 3.5 webview/components/GroupSection.tsx

Renders a single group: header (with collapse toggle, rename, delete, drag handle) and its TODO items. This replaces `createGroupElement()`.

### 3.6 webview/components/TodoItem.tsx

Renders a single TODO: checkbox, text (with double-click-to-edit), copy button, delete button, drag handle. This replaces `createTodoElement()`.

Key behaviors to preserve:
- Double-click text to enter inline edit mode (local state: `editing: boolean`)
- Drag-and-drop with `draggable={true}` and drag event handlers
- Copy button with temporary checkmark feedback

### 3.7 webview/components/InlineAddInput.tsx

The "+" button that reveals an input field. Replaces `createInlineAddButton()` and `showInlineAddInput()`.

### 3.8 webview/components/ArchiveSection.tsx

The `<details>` section showing completed items grouped by their original group. Replaces `renderArchive()`.

Preserves:
- Auto-expand when a new item is completed (compare previous count via `useRef`)
- Grouped display with headers
- Age formatting ("just now", "2 hours ago", "3 days ago")
- Restore (uncheck) and delete buttons

### 3.9 webview/components/GroupManagement.tsx

The "New group name..." input + "+ Group" button at the bottom. Replaces the `addGroup()` function and its event listeners.

### 3.10 webview/hooks/useDragAndDrop.ts

Extract the drag-and-drop logic into a reusable hook. The current vanilla JS has:
- `draggedTodoId` / `draggedGroupId` state
- `setupDropZone()` with dragover/dragleave/drop handlers
- `getDragAfterElement()` for position calculation

This can become a hook or utility:
```typescript
export function useTodoDrag(todoId: string) { ... }
export function useGroupDrag(groupId: string) { ... }
export function useDropZone(groupId: string, listRef: RefObject<HTMLDivElement>) { ... }
```

### 3.11 Delete media/main.js

Once the Preact port is verified working, `media/main.js` is no longer needed. Remove it.

---

## Phase 4: Notes Data Model, Storage, and Messages

### 4.1 src/types.ts -- Add NoteItem and update state types

Add the new interface and update the message types:

```typescript
export interface NoteItem {
  id: string;
  content: string;      // markdown content
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
}

// Update TodoState (keeping the name since it's the persistence format)
export interface AppState {
  todos: TodoItem[];
  groups: TodoGroup[];
  notes: NoteItem[];       // NEW
  schemaVersion: number;   // bump to 2
}

// Add note messages to WebviewToExtensionMessage union:
| { type: 'addNote'; content: string }
| { type: 'editNote'; id: string; content: string }
| { type: 'deleteNote'; id: string }
| { type: 'reorderNote'; id: string; newSortOrder: number }

// Update WebviewTodoState -> WebviewState:
export interface WebviewState {
  activeTodos: TodoItem[];
  archivedTodos: TodoItem[];
  groups: TodoGroup[];
  notes: NoteItem[];       // NEW
}
```

**Decision on naming**: Rename `TodoState` to `AppState` and `WebviewTodoState` to `WebviewState` since the extension now manages more than just TODOs. The `TodoItem` and `TodoGroup` types keep their names since they are still about TODOs specifically.

### 4.2 src/StorageService.ts -- Add note operations

Add the following methods to `StorageService`:

```typescript
// Schema migration: v1 -> v2 (add notes array if missing)
private migrateState(state: any): AppState {
  if (!state.notes) {
    state.notes = [];
  }
  if (state.schemaVersion < 2) {
    state.schemaVersion = 2;
  }
  return state;
}

// CRUD for notes:
addNote(content: string): void { ... }
editNote(id: string, content: string): void { ... }
deleteNote(id: string): void { ... }
reorderNote(id: string, newSortOrder: number): void { ... }

// Update getWebviewState() to include notes:
getWebviewState(): WebviewState {
  const state = this.getState();
  // ... existing todo/group logic ...
  const notes = [...state.notes].sort((a, b) => a.sortOrder - b.sortOrder);
  return { activeTodos, archivedTodos, groups, notes };
}
```

Update `CURRENT_SCHEMA_VERSION` from `1` to `2`.

Update `getState()` to call `migrateState()` to handle existing v1 data (which lacks `notes`).

Update `loadFromFile()` validation to accept `notes` field (or default it).

### 4.3 src/ViewProvider.ts -- Handle note messages

Add cases to `handleMessage()`:

```typescript
case 'addNote':
  this.storage.addNote(message.content);
  this.sendStateToWebview();
  break;
case 'editNote':
  this.storage.editNote(message.id, message.content);
  this.sendStateToWebview();
  break;
case 'deleteNote':
  this.storage.deleteNote(message.id);
  this.sendStateToWebview();
  break;
case 'reorderNote':
  this.storage.reorderNote(message.id, message.newSortOrder);
  this.sendStateToWebview();
  break;
```

---

## Phase 5: Notes UI Components (Preact)

### 5.1 webview/lib/markdown.ts -- Markdown rendering setup

```typescript
import { marked } from 'marked';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,        // GFM line breaks
  gfm: true,           // GitHub Flavored Markdown
});

export function renderMarkdown(content: string): string {
  // marked.parse returns string synchronously when async: false (default)
  return marked.parse(content) as string;
}
```

**Security note**: Since this runs in a VS Code webview (which is already sandboxed), and the content is user-generated (not from untrusted external sources), basic sanitization is sufficient. The CSP already blocks inline scripts. If additional safety is needed, add `DOMPurify` (~7KB) later.

### 5.2 webview/components/NotesSection.tsx

A collapsible section that displays all notes:

```tsx
function NotesSection({ notes }: { notes: NoteItem[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <div class="notes-section">
      <SectionHeader
        title="Notes"
        count={notes.length}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        actions={
          <button class="section-action-btn" onClick={() => setAdding(true)} title="Add note">
            +
          </button>
        }
      />
      {!collapsed && (
        <div class="notes-list">
          {adding && <NoteItem note={null} onSave={...} onCancel={() => setAdding(false)} />}
          {notes.map(note => <NoteItem key={note.id} note={note} />)}
          {notes.length === 0 && !adding && (
            <div class="empty-message">No notes yet</div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 5.3 webview/components/NoteItem.tsx

Each note has two modes:
1. **View mode**: Renders markdown as HTML, shows edit/delete buttons on hover
2. **Edit mode**: Shows a textarea for editing markdown content

```tsx
function NoteItem({ note, isNew, onCancel }: Props) {
  const [editing, setEditing] = useState(isNew);
  const [content, setContent] = useState(note?.content ?? '');

  const save = () => {
    const trimmed = content.trim();
    if (!trimmed) {
      if (isNew) onCancel?.();
      return;
    }
    if (isNew) {
      postMessage({ type: 'addNote', content: trimmed });
      onCancel?.(); // close the "new note" form
    } else {
      postMessage({ type: 'editNote', id: note!.id, content: trimmed });
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div class="note-item note-editing">
        <textarea
          class="note-textarea"
          value={content}
          onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
          placeholder="Write a note (markdown supported)..."
          rows={4}
          ref={(el) => el?.focus()}
        />
        <div class="note-actions-bar">
          <button onClick={save}>Save</button>
          <button onClick={() => { setEditing(false); onCancel?.(); }}>Cancel</button>
        </div>
      </div>
    );
  }

  // View mode: render markdown
  const html = renderMarkdown(note!.content);
  return (
    <div class="note-item">
      <div
        class="note-content markdown-content"
        dangerouslySetInnerHTML={{ __html: html }}
        onDblClick={() => { setContent(note!.content); setEditing(true); }}
      />
      <div class="note-hover-actions">
        <button onClick={() => { setContent(note!.content); setEditing(true); }} title="Edit">&#9998;</button>
        <button onClick={() => postMessage({ type: 'deleteNote', id: note!.id })} title="Delete">&times;</button>
      </div>
    </div>
  );
}
```

### 5.4 webview/components/SectionHeader.tsx

A shared component for collapsible section headers (used by both TODOs and Notes):

```tsx
function SectionHeader({ title, count, collapsed, onToggle, actions }) {
  return (
    <div class="section-header" onClick={onToggle}>
      {onToggle && (
        <span class="collapse-toggle">{collapsed ? '\u25B6' : '\u25BC'}</span>
      )}
      <span class="section-title">{title}</span>
      <span class="section-count">({count})</span>
      {actions && <div class="section-actions">{actions}</div>}
    </div>
  );
}
```

### 5.5 Update App.tsx to include Notes

```tsx
return (
  <div>
    <TodoSection todos={state.activeTodos} groups={state.groups} />
    <GroupManagement />
    <NotesSection notes={state.notes} />
    <ArchiveSection archived={state.archivedTodos} groups={state.groups} />
  </div>
);
```

Layout order top-to-bottom: TODOs -> Group Management -> Notes -> Archive.

### 5.6 CSS additions for Notes (in media/main.css)

New CSS classes needed:

```css
/* ---- Notes Section ---- */
.notes-section { ... }                /* Container, similar to group-section */
.notes-list { ... }                   /* List container */
.note-item { ... }                    /* Single note card */
.note-item:hover .note-hover-actions { ... }  /* Show actions on hover */
.note-editing { ... }                 /* Editing state */
.note-textarea { ... }               /* Textarea for editing */
.note-actions-bar { ... }            /* Save/Cancel buttons */
.note-hover-actions { ... }          /* Edit/Delete floating buttons */

/* ---- Markdown Content ---- */
.markdown-content h1, .markdown-content h2, ... { ... }
.markdown-content p { ... }
.markdown-content code { ... }
.markdown-content pre { ... }
.markdown-content ul, .markdown-content ol { ... }
.markdown-content a { ... }
.markdown-content blockquote { ... }
```

The markdown styles should use VS Code CSS variables for theme-appropriate rendering:
- Code blocks: `var(--vscode-textCodeBlock-background)`
- Links: `var(--vscode-textLink-foreground)`
- Blockquotes: subtle left border with reduced opacity

---

## Phase 6: MCP Server -- Notes Tools

### 6.1 Update state handling in mcp-server.js

Update `readState()` to handle the new schema:
```javascript
const SCHEMA_VERSION = 2;

function readState() {
  // ... existing code ...
  // Add notes migration for v1 states:
  if (!state.notes) { state.notes = []; }
  return state;
}
```

### 6.2 Add note tools

Add 4 new MCP tools:

**`list_notes`** -- List all notes

```javascript
server.tool(
  'list_notes',
  'List all notes with their content.',
  {},
  async () => {
    const state = readState();
    const notes = state.notes.sort((a, b) => a.sortOrder - b.sortOrder);
    if (notes.length === 0) {
      return { content: [{ type: 'text', text: 'No notes.' }] };
    }
    const lines = notes.map((n, i) => `[${i + 1}] (id: ${n.id})\n${n.content}`);
    return { content: [{ type: 'text', text: lines.join('\n\n---\n\n') }] };
  }
);
```

**`add_note`** -- Add a new note

```javascript
server.tool(
  'add_note',
  'Add a new note with markdown content.',
  {
    content: z.string().describe('Markdown content for the note'),
  },
  async ({ content }) => {
    const state = readState();
    const note = {
      id: generateId(),
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sortOrder: state.notes.length,
    };
    state.notes.push(note);
    writeState(state);
    return { content: [{ type: 'text', text: `Added note (id: ${note.id})` }] };
  }
);
```

**`edit_note`** -- Edit an existing note

```javascript
server.tool(
  'edit_note',
  'Edit the content of a note. Match by id or content substring.',
  {
    id: z.string().optional().describe('Exact note id'),
    content_match: z.string().optional().describe('Content substring to match (case-insensitive)'),
    new_content: z.string().describe('New markdown content'),
  },
  async ({ id, content_match, new_content }) => {
    const state = readState();
    const note = findNote(state.notes, { id, content_match });
    if (!note) {
      return { content: [{ type: 'text', text: `No note matching "${id || content_match}"` }], isError: true };
    }
    note.content = new_content;
    note.updatedAt = Date.now();
    writeState(state);
    return { content: [{ type: 'text', text: `Edited note (id: ${note.id})` }] };
  }
);
```

**`delete_note`** -- Delete a note

```javascript
server.tool(
  'delete_note',
  'Delete a note. Match by id or content substring.',
  {
    id: z.string().optional().describe('Exact note id'),
    content_match: z.string().optional().describe('Content substring to match (case-insensitive)'),
  },
  async ({ id, content_match }) => {
    const state = readState();
    const note = findNote(state.notes, { id, content_match });
    if (!note) {
      return { content: [{ type: 'text', text: `No note matching "${id || content_match}"` }], isError: true };
    }
    state.notes = state.notes.filter(n => n.id !== note.id);
    writeState(state);
    return { content: [{ type: 'text', text: `Deleted note (id: ${note.id})` }] };
  }
);
```

### 6.3 Add findNote helper

```javascript
function findNote(notes, { id, content_match }) {
  if (id) {
    return notes.find(n => n.id === id);
  }
  if (content_match) {
    const lower = content_match.toLowerCase();
    return notes.find(n => n.content.toLowerCase().includes(lower));
  }
  return undefined;
}
```

---

## Phase 7: State File Migration

When users upgrade from the old extension, two things need to happen:

### 7.1 File rename: .mytodos.json -> .mydevnotes.json

In `src/extension.ts`, during activation, check for the old file and rename it:

```typescript
// In activate(), before setting the file path:
const oldFilePath = path.join(workspaceFolder.uri.fsPath, '.vscode', '.mytodos.json');
const newFilePath = path.join(workspaceFolder.uri.fsPath, '.vscode', '.mydevnotes.json');

if (fs.existsSync(oldFilePath) && !fs.existsSync(newFilePath)) {
  fs.renameSync(oldFilePath, newFilePath);
}
storage.setFilePath(newFilePath);
```

### 7.2 Memento key migration: mytodos.state -> mydevnotes.state

In `StorageService`, check for data under the old key:

```typescript
private getState(): AppState {
  let state = this.workspaceState.get<AppState>('mydevnotes.state');
  if (!state) {
    // Try migrating from old key
    state = this.workspaceState.get<AppState>('mytodos.state');
    if (state) {
      // Migrate: write to new key, clear old key
      this.workspaceState.update('mydevnotes.state', state);
      this.workspaceState.update('mytodos.state', undefined);
    }
  }
  if (!state) {
    return { todos: [], groups: [], notes: [], schemaVersion: CURRENT_SCHEMA_VERSION };
  }
  return this.migrateState(state);
}
```

### 7.3 Schema version migration: v1 -> v2

The `migrateState()` method in `StorageService` handles adding the `notes` array:

```typescript
private migrateState(state: any): AppState {
  // v1 -> v2: add notes array
  if (!state.notes || !Array.isArray(state.notes)) {
    state.notes = [];
  }
  state.schemaVersion = CURRENT_SCHEMA_VERSION; // 2
  return state as AppState;
}
```

### 7.4 MCP server registration cleanup

In `registerMcpServer()`, remove the old `mytodos` entry and register `mydevnotes`:

```typescript
// Remove old registration if present
if (config.mcpServers?.mytodos) {
  delete config.mcpServers.mytodos;
}

// Register new
config.mcpServers.mydevnotes = {
  command: 'node',
  args: [mcpServerPath],
};
```

### 7.5 File watcher update

The watcher pattern changes from `.vscode/.mytodos.json` to `.vscode/.mydevnotes.json`.

---

## Phase 8: Final Cleanup and Testing

### 8.1 Update README.md

Full rewrite reflecting:
- New name: My Dev Notes
- New feature: Notes with markdown support
- Updated MCP tools table (add note tools)
- Updated settings table
- Updated screenshots/description

### 8.2 Update .gitignore

```
.vscode/.mydevnotes.json
```
(remove old `.vscode/.mytodos.json` line)

### 8.3 Update media/todo-icon.svg

Consider updating the icon to reflect that the extension now handles notes too, not just TODOs. This is optional and cosmetic.

### 8.4 Delete media/main.js

The old vanilla JS file is fully replaced by the Preact webview bundle.

### 8.5 Testing checklist

| Test                    | What to verify                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Fresh install**       | Extension activates, creates `.vscode/.mydevnotes.json`, sidebar shows "My Dev Notes" |
| **Migration from v1**   | Old `.mytodos.json` is renamed. Old Memento state is migrated. Data is preserved.     |
| **TODOs - CRUD**        | Add, edit (double-click), delete, complete, restore all work                          |
| **TODOs - Groups**      | Create, rename, delete groups. TODOs move to ungrouped on group delete.               |
| **TODOs - Drag & drop** | Reorder TODOs within group, move between groups, reorder groups                       |
| **TODOs - Archive**     | Completed items appear in archive. Auto-expand on new completion. 7-day cleanup.      |
| **Notes - CRUD**        | Add note, edit note (double-click or edit button), delete note                        |
| **Notes - Markdown**    | Headings, bold, italic, code blocks, links, lists render correctly                    |
| **Notes - Collapse**    | Notes section collapses/expands                                                       |
| **MCP - TODOs**         | All 12 existing tools work with the new `mydevnotes` server name                      |
| **MCP - Notes**         | `list_notes`, `add_note`, `edit_note`, `delete_note` all work                         |
| **MCP - Registration**  | `~/.claude.json` has `mydevnotes` entry, old `mytodos` entry is removed               |
| **Commands**            | `mydevnotes.addTodo` command works from command palette                               |
| **Settings**            | `mydevnotes.mcpAutoRegister` setting works                                            |
| **Theme compatibility** | Light theme, dark theme, and high contrast all render properly                        |
| **Build**               | `npm run build` produces `out/extension.js`, `out/webview.js`, `out/mcp-server.js`    |
| **Package**             | `vsce package` creates a valid `.vsix`                                                |

---

## Dependency Summary

### New npm dependencies

| Package         | Type                     | Size      | Purpose                     |
| --------------- | ------------------------ | --------- | --------------------------- |
| `preact`        | runtime                  | ~3KB gzip | UI framework for webview    |
| `marked`        | runtime (webview bundle) | ~32KB     | Markdown to HTML            |
| `@types/marked` | devDependency            | --        | TypeScript types for marked |

### No new runtime deps for extension host
`preact` and `marked` are bundled into the webview JS by esbuild. They do not affect the extension host bundle size.

---

## Risk Assessment and Mitigations

| Risk                               | Impact                       | Mitigation                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag-and-drop regression in Preact | High -- core UX feature      | Port the exact same DOM event handlers; test thoroughly. Consider keeping the drag logic as vanilla event listeners attached via `useEffect` refs rather than trying to make it "Preact-idiomatic". |
| CSP blocking markdown styles       | Medium -- notes won't render | Keep all styles in CSS file with `.markdown-content` prefix. No `unsafe-inline` needed. Test with VS Code's strict CSP.                                                                             |
| Migration data loss                | High                         | Migration code runs only once (old key exists, new key does not). Atomic rename. Add a log message for debugging.                                                                                   |
| `marked` XSS in webview            | Low -- webview is sandboxed  | CSP blocks inline scripts. Add `DOMPurify` later if needed.                                                                                                                                         |
| Large webview bundle               | Low                          | Preact (~3KB) + marked (~32KB) = ~35KB. Negligible for a webview.                                                                                                                                   |
| MCP server backward compatibility  | Medium                       | Old `mytodos` server name in `~/.claude.json` needs cleanup. The migration in `registerMcpServer()` handles this.                                                                                   |

---

## File Change Summary

| File                                     | Action                                        | Phase   |
| ---------------------------------------- | --------------------------------------------- | ------- |
| `package.json`                           | Modify (rename all identifiers)               | 1, 2    |
| `src/extension.ts`                       | Modify (rename + migration logic)             | 1, 4, 7 |
| `src/TodoStorageService.ts`              | Rename to `src/StorageService.ts`, modify     | 1, 4, 7 |
| `src/TodoViewProvider.ts`                | Rename to `src/ViewProvider.ts`, modify       | 1, 2, 4 |
| `src/types.ts`                           | Modify (add NoteItem, AppState, new messages) | 4       |
| `mcp-server.js`                          | Modify (rename + add note tools)              | 1, 6    |
| `.gitignore`                             | Modify                                        | 1       |
| `.vscodeignore`                          | Modify                                        | 2       |
| `tsconfig.json`                          | Modify (JSX support)                          | 2       |
| `README.md`                              | Rewrite                                       | 8       |
| `media/main.css`                         | Modify (add notes + markdown styles)          | 5       |
| `media/main.js`                          | **Delete**                                    | 3       |
| `build.mjs`                              | **Create**                                    | 2       |
| `webview/app.tsx`                        | **Create**                                    | 3       |
| `webview/components/App.tsx`             | **Create**                                    | 3       |
| `webview/components/TodoSection.tsx`     | **Create**                                    | 3       |
| `webview/components/TodoItem.tsx`        | **Create**                                    | 3       |
| `webview/components/GroupSection.tsx`    | **Create**                                    | 3       |
| `webview/components/InlineAddInput.tsx`  | **Create**                                    | 3       |
| `webview/components/ArchiveSection.tsx`  | **Create**                                    | 3       |
| `webview/components/GroupManagement.tsx` | **Create**                                    | 3       |
| `webview/components/SectionHeader.tsx`   | **Create**                                    | 3, 5    |
| `webview/components/NotesSection.tsx`    | **Create**                                    | 5       |
| `webview/components/NoteItem.tsx`        | **Create**                                    | 5       |
| `webview/hooks/useVSCodeApi.ts`          | **Create**                                    | 3       |
| `webview/hooks/useDragAndDrop.ts`        | **Create**                                    | 3       |
| `webview/lib/markdown.ts`                | **Create**                                    | 5       |
| `webview/types.ts`                       | **Create**                                    | 3       |
