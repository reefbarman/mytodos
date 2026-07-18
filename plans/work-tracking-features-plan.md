# Work Tracking Features Plan

Adds five features to My Dev Notes: a **global/project scope split**, **snooze TODOs**, **current task pin + status bar**, **search/filter**, and **tags with filtering**.

## Current Architecture (relevant facts)

- State (`AppState = { todos, groups, notes, schemaVersion: 2 }`) is stored in `~/.mydevnotes/data.json`, keyed by workspace path. The VS Code memento (`workspaceState`) is the in-editor source of truth; the file is synced on every write and watched for MCP-driven changes.
- `src/StorageService.ts` owns all mutations; `src/ViewProvider.ts` maps webview messages to storage calls; `webview/App.tsx` (Preact) renders from a pushed `WebviewState`.
- `mcp-server.js` is standalone and reads/writes the same file keyed by `process.cwd()`.

## Design Decisions

| Decision               | Choice                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Global scope storage   | Reserved key `"::global::"` in the same `data.json`                                                   | Reuses all existing file-sync/watcher/MCP machinery. Documented reserved key; a POSIX path named `::global::` is theoretically possible but not a realistic collision, and re-enveloping the file format would force a data migration for no practical gain.                                                                                                 |
| Global scope authority | **File is authoritative for global scope**; `context.globalState` is a warm cache only                | Multiple VS Code windows share the global scope. A window with a stale memento must never overwrite a newer `::global::` file entry — so global scope is loaded from file before first use and is *never* written on activation, only after a local mutation. Project scope keeps the existing memento-first pattern (one window per workspace in practice). |
| Tags                   | Derived from `#tag` tokens in todo text — no stored field                                             | Zero schema change; editing stays plain text; chips rendered at display time. Parser semantics defined in step 7 so webview and MCP agree.                                                                                                                                                                                                                   |
| Snooze                 | Optional `snoozedUntil?: number` on `TodoItem`; wake computed on read **plus a scheduled wake timer** | Wake-up must be near-real-time even when the panel stays open; a single `setTimeout` armed for the earliest `snoozedUntil` handles this without a polling job.                                                                                                                                                                                               |
| Current task           | `currentTaskId?: string` on project-scope `AppState` only                                             | One "what am I doing now" per project. Global todos cannot be pinned; APIs reject/ignore attempts (see step 6).                                                                                                                                                                                                                                              |
| Search/filter          | Webview-only state                                                                                    | No storage or protocol changes; instant filtering.                                                                                                                                                                                                                                                                                                           |

## Schema Changes (v2 → v3)

```ts
interface TodoItem {
  // existing fields...
  snoozedUntil?: number;   // hidden from active list until this timestamp
}

interface AppState {
  // existing fields...
  currentTaskId?: string;  // pinned "current task" todo id (project scope)
}
```

Migration: bump `CURRENT_SCHEMA_VERSION` to 3 in `migrateState()` (both `StorageService.ts` and `mcp-server.js`). All new fields are optional — migration just stamps the version.

Compatibility note: this is **file-format compatible**, not behaviorally backward-compatible. An older extension or MCP server reading v3 data will preserve unknown fields but will treat snoozed todos as active and won't clear `currentTaskId` on completion. Since extension and bundled MCP server ship together, the only realistic skew is a stale registered MCP path — acceptable degraded behavior, documented in README.

## Implementation Steps

### 1. Types & schema (`src/types.ts`, `src/StorageService.ts`, `mcp-server.js`)

- Add `snoozedUntil` to `TodoItem`, `currentTaskId` to `AppState`.
- Add `Scope = 'project' | 'global'` type.
- Bump schema version to 3; update `migrateState()` in both implementations.

### 2. StorageService scope support (`src/StorageService.ts`)

- Constructor takes both `workspaceState` and `globalState` mementos.
- `getState(scope)` / `setState(scope, state)`: project uses `workspaceState` + workspace-path key; global uses `globalState` + `"::global::"` key in `data.json`.
- **Startup ordering (critical):** on activation, load the `::global::` entry from file into `globalState` *before* any read of global scope; the existing "sync memento to file on startup" behavior in `setWorkspacePath()` applies to **project scope only**. Global scope is written to file only after a local mutation — never on activation. This prevents a stale window from clobbering newer global data written by another window or MCP.
- Add `scope: Scope` parameter to every mutation method (`addTodo`, `toggleTodo`, …). No silent defaulting inside StorageService — callers pass it explicitly.
- `loadFromFile()` loads project and global entries **independently** and returns true if *either* was loaded — a missing project entry must not cause a present global entry to be ignored (the current implementation's "valid workspace entry or bail" shape doesn't carry over).
- `getWebviewState(scope)` returns the requested scope's view, splitting active todos into `activeTodos` (not snoozed, or `snoozedUntil <= now`) and `snoozedTodos` (`snoozedUntil > now`), sorted by wake time. Wake-up is computed, never mutated — avoids write churn.
- `getNextWakeTime(): number | undefined` — earliest future `snoozedUntil` across both scopes, used by the wake timer (step 5).

### 3. Message protocol & ViewProvider (`src/types.ts`, `src/ViewProvider.ts`)

- Add **required** `scope: Scope` to every mutating todo/group/note message in the TypeScript union (`ready` and `setActiveScope` excepted). No optional-with-default — the compiler enforces threading.
- New messages: `snoozeTodo { id, until, scope }`, `unsnoozeTodo { id, scope }`, `setCurrentTask { id: string | null }` (no scope — project-only), `setActiveScope { scope }`.
- `WebviewState` gains `scope`, `snoozedTodos`, `currentTaskId`.
- ViewProvider tracks the active scope (persisted in `globalState` so it survives reloads). Mutating messages carry the scope captured from the state they rendered against; ViewProvider validates it's a known scope value before dispatching. Since ids are unique per scope, a message racing a scope switch targets the scope it was issued from — correct behavior, not a hazard.
- After any mutation, re-send state via the centralized refresh path (step 6), which also updates the status bar.

### 4. Webview scope toggle (`webview/App.tsx`, new `components/ScopeToggle.tsx`)

- Segmented Project / Global control at the top of the panel.
- Switching posts `setActiveScope`; extension responds with a `stateUpdate` for that scope.
- All existing sections render unchanged against whichever state arrives — `post()` helpers thread `scope` from the current state into every message.
- Empty-state hint in Global scope ("Notes here are visible in every workspace").

### 5. Snooze UI + wake timer (`webview/components/TodoItem.tsx`, new `SnoozedSection.tsx`, `src/extension.ts`)

- Hover action on each todo: snooze menu with presets (Later today +4h, Tomorrow 9am, Next week Mon 9am, custom date input).
- Collapsible "Snoozed" section (between Archive and Notes) listing snoozed todos with wake time ("wakes in 2d"); actions: wake now, re-snooze, delete.
- Completing a snoozed todo clears `snoozedUntil`.
- **Wake timer:** extension keeps a single `setTimeout` armed for `storage.getNextWakeTime()`, re-armed after every mutation, watcher reload, and timer fire (clamp very long delays to 24h and re-arm — `setTimeout` overflows past ~24.8 days). On fire, run the centralized refresh. This makes wake-up near-real-time instead of "within 30 minutes if you're lucky"; the 30-min cleanup interval remains as a backstop.

### 6. Current task pin + status bar + centralized refresh (`src/extension.ts`, `webview/components/TodoItem.tsx`)

- Pin icon on each active **project-scope** todo only; pinned todo gets a highlighted bar at the top of the TODOs section. Global todos render no pin affordance, and `setCurrentTask` / `set_current_task` validate the id exists in project scope (otherwise no-op with an MCP error message).
- `vscode.StatusBarItem` showing `$(pin) <truncated text>` (~40 chars, full text in tooltip); click runs a command that reveals the My Dev Notes view.
- Clearing rules: completing, snoozing, or deleting the current task clears `currentTaskId` (a snoozed "current task" is a contradiction).
- **Centralized refresh:** `extension.ts` owns a single `refreshAll()` that re-sends webview state, updates the status bar, and re-arms the wake timer. It is the one funnel called after ViewProvider mutations (via callback), watcher reloads, archive cleanup, and wake-timer fires — so MCP edits and side effects (e.g. current-task clearing) can't miss the status bar.

### 7. Search/filter + tags (webview only)

- Filter input at the top (below scope toggle) with a `mydevnotes.focusSearch` command + keybinding.
- Case-insensitive substring match across todo text and note content; matching items shown even inside collapsed groups. Filter-time group expansion is **purely derived UI state** — never calls `toggleGroupCollapse`, so persisted collapse state is untouched.
- **Tag semantics (single definition, used by webview and MCP):** regex `/#([\p{L}\d_-]+)/gu` against todo text; tags normalized to lowercase for matching and counting; parsed from **active (non-snoozed) and snoozed** todos — archived/completed todos contribute nothing to chips or counts. Notes are not parsed (markdown `#` heading collision). Webview and MCP server can't share a module (separate bundles), so the regex + normalization rules are documented in a comment block in both places with a "keep in sync" marker.
- Tags render as clickable chips; clicking a chip sets the filter to `#tag` (filter input understands a leading `#` as tag-only match).
- Tag row above the list showing all tags in the current scope with counts, for one-click filtering.

### 8. MCP server (`mcp-server.js`)

- Add optional `scope` param (`"project"` | `"global"`, default `"project"`) to all existing tools; `readState`/`writeState` take the scope key. (Defaulting is acceptable here — unlike the webview, MCP callers have no rendered state to thread from, and project is the safe default.)
- New tools: `snooze_todo`, `unsnooze_todo` (scoped), `set_current_task`, `get_current_task` (**not scoped** — project-only by definition; reject ids not found in project scope).
- `list_todos`: exclude snoozed by default with `include_snoozed` option; add `tag` filter (matches derived `#tags`, lowercase-normalized per step 7); mark the current task in output.

### 9. Docs (`README.md`)

- Document scope split, snooze, current task, search/tags, new MCP tools/params, schema v3 note.

## Risks & Trade-offs

- **Two mementos vs. one file**: global-scope writes from two VS Code windows can race on `data.json`. The file-authoritative + load-before-write + never-write-on-activation rules (step 2) eliminate the stale-startup-clobber case; what remains is last-write-wins on *concurrent* mutations of the global entry, with blast radius limited to one scope's entry by the read-merge-write in `writeToFile`. Acceptable for a personal notes tool; a lock file would be over-engineering.
- **Watcher granularity**: a global-scope MCP edit must refresh windows whose active scope is global. Loading both scopes independently on every watcher event (step 2) handles this cheaply.
- **Snooze wake precision**: near-real-time via the wake timer; worst case after a missed timer (e.g. machine sleep) is the next refresh trigger. The 30-min interval is a backstop, not the mechanism.
- **Tag false positives**: `#` in code snippets inside todo text would parse as tags. Acceptable for todos (short text); tags are deliberately *not* parsed from notes.
- **Status bar truncation**: long todo text is truncated with full text in the tooltip.
- **Reserved key `::global::`**: documented as reserved in README; collision requires a workspace literally at a directory named `::global::`, which we accept as a non-risk rather than migrating the whole file format to an envelope.

## Out of Scope (deliberately)

- Moving items between scopes (can be added later as a context-menu action; storage design supports it trivially).
- Tag-based filtering in notes; recurring snoozes; multiple pinned tasks.
