import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TodoItem, TodoGroup, NoteItem, AppState, WebviewState } from './types';

const STORAGE_KEY = 'mydevnotes.state';
const OLD_STORAGE_KEY = 'mytodos.state';
const ARCHIVE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CURRENT_SCHEMA_VERSION = 2;
const GLOBAL_DIR = path.join(os.homedir(), '.mydevnotes');
const GLOBAL_FILE = path.join(GLOBAL_DIR, 'data.json');

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export class StorageService {
  private workspacePath: string | undefined;
  private writingFile = false; // guard against watcher loops

  constructor(private readonly workspaceState: vscode.Memento) {
    // Migrate from old memento key if needed
    const existing = this.workspaceState.get<AppState>(STORAGE_KEY);
    if (!existing) {
      const old = this.workspaceState.get<AppState>(OLD_STORAGE_KEY);
      if (old) {
        this.workspaceState.update(STORAGE_KEY, old);
      }
    }
  }

  /** Set the workspace path — used as key in the global data file */
  setWorkspacePath(workspacePath: string): void {
    this.workspacePath = workspacePath;
    // Ensure global directory exists
    if (!fs.existsSync(GLOBAL_DIR)) {
      fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    }
    // Sync current state to file on startup
    this.writeToFile(this.getState());
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
    if (!this.workspacePath) { return false; }
    try {
      if (!fs.existsSync(GLOBAL_FILE)) { return false; }
      const data = fs.readFileSync(GLOBAL_FILE, 'utf-8');
      const globalData = JSON.parse(data);
      const state = globalData[this.workspacePath] as AppState;
      if (state && state.todos && state.groups) {
        this.workspaceState.update(STORAGE_KEY, this.migrateState(state));
        return true;
      }
    } catch {
      // Ignore parse errors from partial writes
    }
    return false;
  }

  /** Import data from old .vscode/.mytodos.json file */
  importOldFile(oldFilePath: string): boolean {
    try {
      if (!fs.existsSync(oldFilePath)) { return false; }
      const data = fs.readFileSync(oldFilePath, 'utf-8');
      const state = JSON.parse(data) as AppState;
      if (state && state.todos && state.groups) {
        const migrated = this.migrateState(state);
        this.workspaceState.update(STORAGE_KEY, migrated);
        this.writeToFile(migrated);
        // Delete the old file
        fs.unlinkSync(oldFilePath);
        return true;
      }
    } catch {
      // Ignore errors
    }
    return false;
  }

  private migrateState(state: AppState): AppState {
    if (!state.schemaVersion || state.schemaVersion < 2) {
      state.notes = state.notes || [];
      state.schemaVersion = CURRENT_SCHEMA_VERSION;
    }
    return state;
  }

  private getState(): AppState {
    const state = this.workspaceState.get<AppState>(STORAGE_KEY);
    if (!state) {
      return { todos: [], groups: [], notes: [], schemaVersion: CURRENT_SCHEMA_VERSION };
    }
    return this.migrateState(state);
  }

  private setState(state: AppState): void {
    this.workspaceState.update(STORAGE_KEY, state);
    this.writeToFile(state);
  }

  private writeToFile(state: AppState): void {
    if (!this.workspacePath) { return; }
    try {
      this.writingFile = true;
      // Read existing global data
      let globalData: Record<string, AppState> = {};
      if (fs.existsSync(GLOBAL_FILE)) {
        try {
          globalData = JSON.parse(fs.readFileSync(GLOBAL_FILE, 'utf-8'));
        } catch {
          globalData = {};
        }
      }
      // Update this workspace's entry
      globalData[this.workspacePath] = state;
      // Ensure directory exists
      if (!fs.existsSync(GLOBAL_DIR)) {
        fs.mkdirSync(GLOBAL_DIR, { recursive: true });
      }
      fs.writeFileSync(GLOBAL_FILE, JSON.stringify(globalData, null, 2), 'utf-8');
      // Small delay before clearing the flag so the watcher event can be ignored
      setTimeout(() => { this.writingFile = false; }, 100);
    } catch {
      this.writingFile = false;
    }
  }

  getWebviewState(): WebviewState {
    const state = this.getState();
    const now = Date.now();
    const activeTodos = state.todos
      .filter(t => !t.done)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const archivedTodos = state.todos
      .filter(t => t.done && t.completedAt && (now - t.completedAt) < ARCHIVE_EXPIRY_MS)
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const groups = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);
    const notes = [...(state.notes || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    return { activeTodos, archivedTodos, groups, notes };
  }

  // ---- TODO operations ----

  addTodo(text: string, groupId: string): void {
    const state = this.getState();
    const todosInGroup = state.todos.filter(t => t.groupId === groupId && !t.done);
    const newTodo: TodoItem = {
      id: generateId(),
      text,
      done: false,
      createdAt: Date.now(),
      groupId,
      sortOrder: todosInGroup.length,
    };
    state.todos.push(newTodo);
    this.setState(state);
  }

  toggleTodo(id: string): void {
    const state = this.getState();
    const todo = state.todos.find(t => t.id === id);
    if (!todo) { return; }
    todo.done = !todo.done;
    if (todo.done) {
      todo.completedAt = Date.now();
    } else {
      todo.completedAt = undefined;
      const todosInGroup = state.todos.filter(
        t => t.groupId === todo.groupId && !t.done && t.id !== todo.id
      );
      todo.sortOrder = todosInGroup.length;
    }
    this.setState(state);
  }

  deleteTodo(id: string): void {
    const state = this.getState();
    state.todos = state.todos.filter(t => t.id !== id);
    this.setState(state);
  }

  editTodo(id: string, text: string): void {
    const state = this.getState();
    const todo = state.todos.find(t => t.id === id);
    if (!todo) { return; }
    todo.text = text;
    this.setState(state);
  }

  reorderTodo(id: string, newGroupId: string, newSortOrder: number): void {
    const state = this.getState();
    const todo = state.todos.find(t => t.id === id);
    if (!todo) { return; }

    const oldGroupId = todo.groupId;
    todo.groupId = newGroupId;

    // Renumber target group
    const targetGroupTodos = state.todos
      .filter(t => t.groupId === newGroupId && !t.done && t.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    targetGroupTodos.splice(newSortOrder, 0, todo);
    targetGroupTodos.forEach((t, i) => { t.sortOrder = i; });

    // Renumber source group if moved between groups
    if (oldGroupId !== newGroupId) {
      const sourceGroupTodos = state.todos
        .filter(t => t.groupId === oldGroupId && !t.done)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      sourceGroupTodos.forEach((t, i) => { t.sortOrder = i; });
    }

    this.setState(state);
  }

  // ---- Group operations ----

  addGroup(name: string): void {
    const state = this.getState();
    const newGroup: TodoGroup = {
      id: generateId(),
      name,
      sortOrder: state.groups.length,
      collapsed: false,
    };
    state.groups.push(newGroup);
    this.setState(state);
  }

  renameGroup(id: string, name: string): void {
    const state = this.getState();
    const group = state.groups.find(g => g.id === id);
    if (!group) { return; }
    group.name = name;
    this.setState(state);
  }

  deleteGroup(id: string): void {
    const state = this.getState();
    // Move todos from deleted group to ungrouped
    state.todos.forEach(t => {
      if (t.groupId === id) { t.groupId = ''; }
    });
    state.groups = state.groups.filter(g => g.id !== id);
    state.groups
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((g, i) => { g.sortOrder = i; });
    this.setState(state);
  }

  reorderGroup(id: string, newSortOrder: number): void {
    const state = this.getState();
    const group = state.groups.find(g => g.id === id);
    if (!group) { return; }
    const sorted = state.groups
      .filter(g => g.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.splice(newSortOrder, 0, group);
    sorted.forEach((g, i) => { g.sortOrder = i; });
    state.groups = sorted;
    this.setState(state);
  }

  toggleGroupCollapse(id: string): void {
    const state = this.getState();
    const group = state.groups.find(g => g.id === id);
    if (!group) { return; }
    group.collapsed = !group.collapsed;
    this.setState(state);
  }

  restoreTodo(id: string): void {
    this.toggleTodo(id);
  }

  cleanupExpiredArchive(): void {
    const state = this.getState();
    const now = Date.now();
    const before = state.todos.length;
    state.todos = state.todos.filter(t => {
      if (t.done && t.completedAt) {
        return (now - t.completedAt) < ARCHIVE_EXPIRY_MS;
      }
      return true;
    });
    if (state.todos.length !== before) {
      this.setState(state);
    }
  }

  // ---- Note operations ----

  addNote(content: string): void {
    const state = this.getState();
    const newNote: NoteItem = {
      id: generateId(),
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sortOrder: state.notes.length,
    };
    state.notes.push(newNote);
    this.setState(state);
  }

  editNote(id: string, content: string): void {
    const state = this.getState();
    const note = state.notes.find(n => n.id === id);
    if (!note) { return; }
    note.content = content;
    note.updatedAt = Date.now();
    this.setState(state);
  }

  deleteNote(id: string): void {
    const state = this.getState();
    state.notes = state.notes.filter(n => n.id !== id);
    // Renumber sort orders
    state.notes
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((n, i) => { n.sortOrder = i; });
    this.setState(state);
  }

  reorderNote(id: string, newSortOrder: number): void {
    const state = this.getState();
    const note = state.notes.find(n => n.id === id);
    if (!note) { return; }
    const sorted = state.notes
      .filter(n => n.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.splice(newSortOrder, 0, note);
    sorted.forEach((n, i) => { n.sortOrder = i; });
    state.notes = sorted;
    this.setState(state);
  }
}
