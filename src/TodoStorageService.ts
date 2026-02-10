import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TodoItem, TodoGroup, TodoState, WebviewTodoState } from './types';

const STORAGE_KEY = 'mytodos.state';
const ARCHIVE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CURRENT_SCHEMA_VERSION = 1;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export class TodoStorageService {
  private filePath: string | undefined;
  private writingFile = false; // guard against watcher loops

  constructor(private readonly workspaceState: vscode.Memento) {}

  /** Enable dual-write to a JSON file for MCP server access */
  setFilePath(filePath: string): void {
    this.filePath = filePath;
    // Ensure .vscode directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Sync current state to file on startup
    this.writeToFile(this.getState());
  }

  /** Returns true if the service is currently writing (to ignore watcher events) */
  get isWriting(): boolean {
    return this.writingFile;
  }

  /** Load state from the JSON file (called when MCP server modifies it) */
  loadFromFile(): boolean {
    if (!this.filePath || !fs.existsSync(this.filePath)) { return false; }
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const state = JSON.parse(data) as TodoState;
      if (state && state.todos && state.groups) {
        this.workspaceState.update(STORAGE_KEY, state);
        return true;
      }
    } catch {
      // Ignore parse errors from partial writes
    }
    return false;
  }

  private getState(): TodoState {
    const state = this.workspaceState.get<TodoState>(STORAGE_KEY);
    if (!state) {
      return { todos: [], groups: [], schemaVersion: CURRENT_SCHEMA_VERSION };
    }
    return state;
  }

  private setState(state: TodoState): void {
    this.workspaceState.update(STORAGE_KEY, state);
    this.writeToFile(state);
  }

  private writeToFile(state: TodoState): void {
    if (!this.filePath) { return; }
    try {
      this.writingFile = true;
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
      // Small delay before clearing the flag so the watcher event can be ignored
      setTimeout(() => { this.writingFile = false; }, 100);
    } catch {
      this.writingFile = false;
    }
  }

  getWebviewState(): WebviewTodoState {
    const state = this.getState();
    const now = Date.now();
    const activeTodos = state.todos
      .filter(t => !t.done)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const archivedTodos = state.todos
      .filter(t => t.done && t.completedAt && (now - t.completedAt) < ARCHIVE_EXPIRY_MS)
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const groups = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);
    return { activeTodos, archivedTodos, groups };
  }

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
}
