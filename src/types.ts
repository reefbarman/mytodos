export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  completedAt?: number;
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
  schemaVersion: number;
}

// Messages: webview → extension host
export type WebviewToExtensionMessage =
  | { type: "addTodo"; text: string; groupId: string }
  | { type: "toggleTodo"; id: string }
  | { type: "deleteTodo"; id: string }
  | { type: "editTodo"; id: string; text: string }
  | {
      type: "reorderTodo";
      id: string;
      newGroupId: string;
      newSortOrder: number;
    }
  | { type: "addGroup"; name: string }
  | { type: "renameGroup"; id: string; name: string }
  | { type: "deleteGroup"; id: string }
  | { type: "reorderGroup"; id: string; newSortOrder: number }
  | { type: "toggleGroupCollapse"; id: string }
  | { type: "restoreTodo"; id: string }
  | { type: "addNote"; content: string }
  | { type: "editNote"; id: string; content: string }
  | { type: "deleteNote"; id: string }
  | { type: "reorderNote"; id: string; newSortOrder: number }
  | { type: "ready" };

// Messages: extension host → webview
export type ExtensionToWebviewMessage =
  | { type: "stateUpdate"; state: WebviewState }
  | { type: "focusAddInput" };

export interface WebviewState {
  activeTodos: TodoItem[];
  archivedTodos: TodoItem[];
  groups: TodoGroup[];
  notes: NoteItem[];
}
