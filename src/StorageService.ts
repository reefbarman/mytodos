import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import {
  AppState,
  NoteItem,
  Scope,
  TodoGroup,
  TodoItem,
  WebviewState,
} from "./types";

const STORAGE_KEY = "mydevnotes.state";
const OLD_STORAGE_KEY = "mytodos.state";
const GLOBAL_STORAGE_KEY = "mydevnotes.globalState";
const ARCHIVE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CURRENT_SCHEMA_VERSION = 3;
const GLOBAL_SCOPE_KEY = "::global::";
const GLOBAL_DIR = path.join(os.homedir(), ".mydevnotes");
const GLOBAL_FILE = path.join(GLOBAL_DIR, "data.json");

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function emptyState(): AppState {
  return {
    todos: [],
    groups: [],
    notes: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function isAppState(value: unknown): value is AppState {
  const state = value as AppState | undefined;
  return !!state && Array.isArray(state.todos) && Array.isArray(state.groups);
}

export class StorageService {
  private workspacePath: string | undefined;
  private writingFile = false; // guard against watcher loops

  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.Memento,
  ) {
    // Migrate from old memento key if needed
    const existing = this.workspaceState.get<AppState>(STORAGE_KEY);
    if (!existing) {
      const old = this.workspaceState.get<AppState>(OLD_STORAGE_KEY);
      if (old) {
        this.workspaceState.update(STORAGE_KEY, this.migrateState(old));
      }
    }
  }

  /** Set the workspace path — used as key in the global data file */
  setWorkspacePath(workspacePath: string): void {
    this.workspacePath = workspacePath;
    this.ensureGlobalDirectory();
    this.loadProjectScopeFromFile();
    this.loadGlobalScopeFromFile();
    // Sync current project state to file on startup. Global scope is file-authoritative and
    // is never written on activation, preventing stale windows from clobbering global notes.
    this.writeToFile(this.getState("project"), "project");
  }

  /** The path to the global data file (for file watcher setup) */
  get globalFilePath(): string {
    return GLOBAL_FILE;
  }

  /** Returns true if the service is currently writing (to ignore watcher events) */
  get isWriting(): boolean {
    return this.writingFile;
  }

  /** Load state from the global JSON file (called when MCP server modifies it) */
  loadFromFile(): boolean {
    if (!this.workspacePath) {
      return false;
    }
    try {
      if (!fs.existsSync(GLOBAL_FILE)) {
        return false;
      }
      const data = fs.readFileSync(GLOBAL_FILE, "utf-8");
      const globalData = JSON.parse(data) as Record<string, AppState>;
      let loaded = false;

      const projectState = globalData[this.workspacePath];
      if (isAppState(projectState)) {
        this.workspaceState.update(
          STORAGE_KEY,
          this.migrateState(projectState),
        );
        loaded = true;
      }

      const globalScopeState = globalData[GLOBAL_SCOPE_KEY];
      if (isAppState(globalScopeState)) {
        this.globalState.update(
          GLOBAL_STORAGE_KEY,
          this.migrateState(globalScopeState, "global"),
        );
        loaded = true;
      }

      return loaded;
    } catch {
      // Ignore parse errors from partial writes
      return false;
    }
  }

  /** Import data from old .vscode/.mytodos.json file */
  importOldFile(oldFilePath: string): boolean {
    try {
      if (!fs.existsSync(oldFilePath)) {
        return false;
      }
      const data = fs.readFileSync(oldFilePath, "utf-8");
      const state = JSON.parse(data) as AppState;
      if (isAppState(state)) {
        const migrated = this.migrateState(state);
        this.workspaceState.update(STORAGE_KEY, migrated);
        this.writeToFile(migrated, "project");
        // Delete the old file
        fs.unlinkSync(oldFilePath);
        return true;
      }
    } catch {
      // Ignore errors
    }
    return false;
  }

  private ensureGlobalDirectory(): void {
    if (!fs.existsSync(GLOBAL_DIR)) {
      fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    }
  }

  private loadProjectScopeFromFile(): void {
    if (!this.workspacePath) {
      return;
    }
    try {
      if (!fs.existsSync(GLOBAL_FILE)) {
        return;
      }
      const globalData = JSON.parse(
        fs.readFileSync(GLOBAL_FILE, "utf-8"),
      ) as Record<string, AppState>;
      const state = globalData[this.workspacePath];
      if (isAppState(state)) {
        this.workspaceState.update(STORAGE_KEY, this.migrateState(state));
      }
    } catch {
      // Ignore parse errors from partial writes
    }
  }

  private loadGlobalScopeFromFile(): void {
    try {
      if (!fs.existsSync(GLOBAL_FILE)) {
        return;
      }
      const globalData = JSON.parse(
        fs.readFileSync(GLOBAL_FILE, "utf-8"),
      ) as Record<string, AppState>;
      const state = globalData[GLOBAL_SCOPE_KEY];
      if (isAppState(state)) {
        this.globalState.update(
          GLOBAL_STORAGE_KEY,
          this.migrateState(state, "global"),
        );
      }
    } catch {
      // Ignore parse errors from partial writes
    }
  }

  private migrateState(state: AppState, scope: Scope = "project"): AppState {
    state.notes = state.notes || [];
    state.schemaVersion = CURRENT_SCHEMA_VERSION;

    const now = Date.now();
    for (const todo of state.todos) {
      if (todo.done || (todo.snoozedUntil && todo.snoozedUntil <= now)) {
        todo.snoozedUntil = undefined;
      }
    }

    if (scope === "global") {
      state.currentTaskId = undefined;
    } else if (
      state.currentTaskId &&
      !state.todos.some(
        (todo) =>
          todo.id === state.currentTaskId && !todo.done && !todo.snoozedUntil,
      )
    ) {
      state.currentTaskId = undefined;
    }

    return state;
  }

  private getState(scope: Scope): AppState {
    const state =
      scope === "global"
        ? this.globalState.get<AppState>(GLOBAL_STORAGE_KEY)
        : this.workspaceState.get<AppState>(STORAGE_KEY);
    if (!state) {
      return emptyState();
    }
    return this.migrateState(state, scope);
  }

  private setState(scope: Scope, state: AppState): void {
    const migrated = this.migrateState(state, scope);
    if (scope === "global") {
      this.globalState.update(GLOBAL_STORAGE_KEY, migrated);
    } else {
      this.workspaceState.update(STORAGE_KEY, migrated);
    }
    this.writeToFile(migrated, scope);
  }

  private writeToFile(state: AppState, scope: Scope): void {
    const storageKey = this.fileKeyForScope(scope);
    if (!storageKey) {
      return;
    }
    try {
      this.writingFile = true;
      // Read existing global data
      let globalData: Record<string, AppState> = {};
      if (fs.existsSync(GLOBAL_FILE)) {
        try {
          globalData = JSON.parse(fs.readFileSync(GLOBAL_FILE, "utf-8"));
        } catch {
          globalData = {};
        }
      }
      // Update this scope's entry
      globalData[storageKey] = state;
      this.ensureGlobalDirectory();
      const tempFile = `${GLOBAL_FILE}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(globalData, null, 2), "utf-8");
      fs.renameSync(tempFile, GLOBAL_FILE);
      // Small delay before clearing the flag so the watcher event can be ignored
      setTimeout(() => {
        this.writingFile = false;
      }, 100);
    } catch {
      this.writingFile = false;
    }
  }

  private fileKeyForScope(scope: Scope): string | undefined {
    if (scope === "global") {
      return GLOBAL_SCOPE_KEY;
    }
    return this.workspacePath;
  }

  getWebviewState(scope: Scope): WebviewState {
    const state = this.getState(scope);
    const now = Date.now();
    const activeTodos = state.todos
      .filter((t) => !t.done && (!t.snoozedUntil || t.snoozedUntil <= now))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const snoozedTodos = state.todos
      .filter((t) => !t.done && !!t.snoozedUntil && t.snoozedUntil > now)
      .sort((a, b) => (a.snoozedUntil || 0) - (b.snoozedUntil || 0));
    const archivedTodos = state.todos
      .filter(
        (t) =>
          t.done && t.completedAt && now - t.completedAt < ARCHIVE_EXPIRY_MS,
      )
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const groups = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);
    const notes = [...(state.notes || [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return {
      scope,
      activeTodos,
      snoozedTodos,
      archivedTodos,
      groups,
      notes,
      currentTaskId: scope === "project" ? state.currentTaskId : undefined,
    };
  }

  getCurrentTask(): TodoItem | undefined {
    const state = this.getState("project");
    if (!state.currentTaskId) {
      return undefined;
    }
    return state.todos.find(
      (todo) =>
        todo.id === state.currentTaskId &&
        !todo.done &&
        (!todo.snoozedUntil || todo.snoozedUntil <= Date.now()),
    );
  }

  getNextWakeTime(): number | undefined {
    const now = Date.now();
    const wakeTimes = (["project", "global"] as Scope[])
      .flatMap((scope) => this.getState(scope).todos)
      .map((todo) => todo.snoozedUntil)
      .filter((time): time is number => !!time && time > now)
      .sort((a, b) => a - b);
    return wakeTimes[0];
  }

  // ---- TODO operations ----

  addTodo(scope: Scope, text: string, groupId: string): void {
    const state = this.getState(scope);
    const todosInGroup = state.todos.filter(
      (t) => t.groupId === groupId && !t.done && !t.snoozedUntil,
    );
    const newTodo: TodoItem = {
      id: generateId(),
      text,
      done: false,
      createdAt: Date.now(),
      groupId,
      sortOrder: todosInGroup.length,
    };
    state.todos.push(newTodo);
    this.setState(scope, state);
  }

  toggleTodo(scope: Scope, id: string): void {
    const state = this.getState(scope);
    const todo = state.todos.find((t) => t.id === id);
    if (!todo) {
      return;
    }
    todo.done = !todo.done;
    if (todo.done) {
      todo.completedAt = Date.now();
      todo.snoozedUntil = undefined;
      if (scope === "project" && state.currentTaskId === id) {
        state.currentTaskId = undefined;
      }
    } else {
      todo.completedAt = undefined;
      const todosInGroup = state.todos.filter(
        (t) =>
          t.groupId === todo.groupId &&
          !t.done &&
          !t.snoozedUntil &&
          t.id !== todo.id,
      );
      todo.sortOrder = todosInGroup.length;
    }
    this.setState(scope, state);
  }

  deleteTodo(scope: Scope, id: string): void {
    const state = this.getState(scope);
    state.todos = state.todos.filter((t) => t.id !== id);
    if (scope === "project" && state.currentTaskId === id) {
      state.currentTaskId = undefined;
    }
    this.setState(scope, state);
  }

  editTodo(scope: Scope, id: string, text: string): void {
    const state = this.getState(scope);
    const todo = state.todos.find((t) => t.id === id);
    if (!todo) {
      return;
    }
    todo.text = text;
    this.setState(scope, state);
  }

  reorderTodo(
    scope: Scope,
    id: string,
    newGroupId: string,
    newSortOrder: number,
  ): void {
    const state = this.getState(scope);
    const todo = state.todos.find((t) => t.id === id);
    if (!todo) {
      return;
    }

    const oldGroupId = todo.groupId;
    todo.groupId = newGroupId;

    // Renumber target group
    const targetGroupTodos = state.todos
      .filter(
        (t) =>
          t.groupId === newGroupId && !t.done && !t.snoozedUntil && t.id !== id,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
    targetGroupTodos.splice(newSortOrder, 0, todo);
    targetGroupTodos.forEach((t, i) => {
      t.sortOrder = i;
    });

    // Renumber source group if moved between groups
    if (oldGroupId !== newGroupId) {
      const sourceGroupTodos = state.todos
        .filter((t) => t.groupId === oldGroupId && !t.done && !t.snoozedUntil)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      sourceGroupTodos.forEach((t, i) => {
        t.sortOrder = i;
      });
    }

    this.setState(scope, state);
  }

  snoozeTodo(scope: Scope, id: string, until: number): void {
    if (until <= Date.now()) {
      return;
    }
    const state = this.getState(scope);
    const todo = state.todos.find((t) => t.id === id && !t.done);
    if (!todo) {
      return;
    }
    todo.snoozedUntil = until;
    if (scope === "project" && state.currentTaskId === id) {
      state.currentTaskId = undefined;
    }
    this.renumberGroup(state, todo.groupId);
    this.setState(scope, state);
  }

  unsnoozeTodo(scope: Scope, id: string): void {
    const state = this.getState(scope);
    const todo = state.todos.find((t) => t.id === id && !t.done);
    if (!todo) {
      return;
    }
    todo.snoozedUntil = undefined;
    const todosInGroup = state.todos.filter(
      (t) =>
        t.groupId === todo.groupId && !t.done && !t.snoozedUntil && t.id !== id,
    );
    todo.sortOrder = todosInGroup.length;
    this.setState(scope, state);
  }

  setCurrentTask(id: string | null): void {
    const state = this.getState("project");
    if (!id) {
      state.currentTaskId = undefined;
      this.setState("project", state);
      return;
    }
    const todo = state.todos.find(
      (t) =>
        t.id === id &&
        !t.done &&
        (!t.snoozedUntil || t.snoozedUntil <= Date.now()),
    );
    if (!todo) {
      return;
    }
    state.currentTaskId = id;
    this.setState("project", state);
  }

  private renumberGroup(state: AppState, groupId: string): void {
    state.todos
      .filter((t) => t.groupId === groupId && !t.done && !t.snoozedUntil)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((t, i) => {
        t.sortOrder = i;
      });
  }

  // ---- Group operations ----

  addGroup(scope: Scope, name: string): void {
    const state = this.getState(scope);
    const newGroup: TodoGroup = {
      id: generateId(),
      name,
      sortOrder: state.groups.length,
      collapsed: false,
    };
    state.groups.push(newGroup);
    this.setState(scope, state);
  }

  renameGroup(scope: Scope, id: string, name: string): void {
    const state = this.getState(scope);
    const group = state.groups.find((g) => g.id === id);
    if (!group) {
      return;
    }
    group.name = name;
    this.setState(scope, state);
  }

  deleteGroup(scope: Scope, id: string): void {
    const state = this.getState(scope);
    // Move todos from deleted group to ungrouped
    state.todos.forEach((t) => {
      if (t.groupId === id) {
        t.groupId = "";
      }
    });
    state.groups = state.groups.filter((g) => g.id !== id);
    state.groups
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((g, i) => {
        g.sortOrder = i;
      });
    this.setState(scope, state);
  }

  reorderGroup(scope: Scope, id: string, newSortOrder: number): void {
    const state = this.getState(scope);
    const group = state.groups.find((g) => g.id === id);
    if (!group) {
      return;
    }
    const sorted = state.groups
      .filter((g) => g.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.splice(newSortOrder, 0, group);
    sorted.forEach((g, i) => {
      g.sortOrder = i;
    });
    state.groups = sorted;
    this.setState(scope, state);
  }

  toggleGroupCollapse(scope: Scope, id: string): void {
    const state = this.getState(scope);
    const group = state.groups.find((g) => g.id === id);
    if (!group) {
      return;
    }
    group.collapsed = !group.collapsed;
    this.setState(scope, state);
  }

  restoreTodo(scope: Scope, id: string): void {
    this.toggleTodo(scope, id);
  }

  cleanupExpiredArchive(): void {
    let changed = false;
    for (const scope of ["project", "global"] as Scope[]) {
      const state = this.getState(scope);
      const now = Date.now();
      const before = state.todos.length;
      state.todos = state.todos.filter((t) => {
        if (t.done && t.completedAt) {
          return now - t.completedAt < ARCHIVE_EXPIRY_MS;
        }
        return true;
      });
      if (state.todos.length !== before) {
        this.setState(scope, state);
        changed = true;
      }
    }
    void changed;
  }

  // ---- Note operations ----

  addNote(scope: Scope, content: string): void {
    const state = this.getState(scope);
    const newNote: NoteItem = {
      id: generateId(),
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sortOrder: state.notes.length,
    };
    state.notes.push(newNote);
    this.setState(scope, state);
  }

  editNote(scope: Scope, id: string, content: string): void {
    const state = this.getState(scope);
    const note = state.notes.find((n) => n.id === id);
    if (!note) {
      return;
    }
    note.content = content;
    note.updatedAt = Date.now();
    this.setState(scope, state);
  }

  deleteNote(scope: Scope, id: string): void {
    const state = this.getState(scope);
    state.notes = state.notes.filter((n) => n.id !== id);
    // Renumber sort orders
    state.notes
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((n, i) => {
        n.sortOrder = i;
      });
    this.setState(scope, state);
  }

  reorderNote(scope: Scope, id: string, newSortOrder: number): void {
    const state = this.getState(scope);
    const note = state.notes.find((n) => n.id === id);
    if (!note) {
      return;
    }
    const sorted = state.notes
      .filter((n) => n.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.splice(newSortOrder, 0, note);
    sorted.forEach((n, i) => {
      n.sortOrder = i;
    });
    state.notes = sorted;
    this.setState(scope, state);
  }
}
