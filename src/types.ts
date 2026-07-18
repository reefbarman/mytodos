export type Scope = "project" | "global";

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  completedAt?: number;
  snoozedUntil?: number;
  groupId: string; // empty string = ungrouped
  sortOrder: number;
}

export interface TodoGroup {
  id: string;
  name: string;
  sortOrder: number;
  collapsed: boolean;
}

export interface NoteItem {
  id: string;
  content: string; // markdown content
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
}

export interface AppState {
  todos: TodoItem[];
  groups: TodoGroup[];
  notes: NoteItem[];
  currentTaskId?: string;
  schemaVersion: number;
}

type ScopedMessage = { scope: Scope };

// Messages: webview → extension host
export type WebviewToExtensionMessage =
  | ({ type: "addTodo"; text: string; groupId: string } & ScopedMessage)
  | ({ type: "toggleTodo"; id: string } & ScopedMessage)
  | ({ type: "deleteTodo"; id: string } & ScopedMessage)
  | ({ type: "editTodo"; id: string; text: string } & ScopedMessage)
  | ({
      type: "reorderTodo";
      id: string;
      newGroupId: string;
      newSortOrder: number;
    } & ScopedMessage)
  | ({ type: "snoozeTodo"; id: string; until: number } & ScopedMessage)
  | ({ type: "unsnoozeTodo"; id: string } & ScopedMessage)
  | ({ type: "addGroup"; name: string } & ScopedMessage)
  | ({ type: "renameGroup"; id: string; name: string } & ScopedMessage)
  | ({ type: "deleteGroup"; id: string } & ScopedMessage)
  | ({ type: "reorderGroup"; id: string; newSortOrder: number } & ScopedMessage)
  | ({ type: "toggleGroupCollapse"; id: string } & ScopedMessage)
  | ({ type: "restoreTodo"; id: string } & ScopedMessage)
  | ({ type: "addNote"; content: string } & ScopedMessage)
  | ({ type: "editNote"; id: string; content: string } & ScopedMessage)
  | ({ type: "deleteNote"; id: string } & ScopedMessage)
  | ({ type: "reorderNote"; id: string; newSortOrder: number } & ScopedMessage)
  | { type: "setCurrentTask"; id: string | null }
  | { type: "setActiveScope"; scope: Scope }
  | { type: "ready" };

// Messages: extension host → webview
export type ExtensionToWebviewMessage =
  | { type: "stateUpdate"; state: WebviewState }
  | { type: "focusAddInput" }
  | { type: "focusSearch" };

export interface WebviewState {
  scope: Scope;
  activeTodos: TodoItem[];
  snoozedTodos: TodoItem[];
  archivedTodos: TodoItem[];
  groups: TodoGroup[];
  notes: NoteItem[];
  currentTaskId?: string;
}
