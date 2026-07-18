import type {
  Scope,
  TodoItem as TodoItemType,
  VSCodeApi,
  WebviewState,
} from "./types";
import { useEffect, useRef, useState } from "preact/hooks";

import { ArchiveSection } from "./components/ArchiveSection";
import { GroupManagement } from "./components/GroupManagement";
import { GroupSection } from "./components/GroupSection";
import { NotesSection } from "./components/NotesSection";
import { SectionHeader } from "./components/SectionHeader";
import { SnoozedSection } from "./components/SnoozedSection";
import { TodoSection } from "./components/TodoSection";
import { render } from "preact";

const vscode: VSCodeApi = acquireVsCodeApi();
const TAG_RE = /#([\p{L}\d_-]+)/gu;

function post(message: any) {
  vscode.postMessage(message);
}

function scopedPost(scope: Scope, message: any) {
  post({ ...message, scope });
}

function tagsForTodo(todo: TodoItemType): string[] {
  const tags = new Set<string>();
  for (const match of todo.text.matchAll(TAG_RE)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

function todoMatches(todo: TodoItemType, query: string): boolean {
  if (!query) return true;
  const lower = query.toLowerCase();
  if (lower.startsWith("#")) {
    const tag = lower.slice(1);
    return tagsForTodo(todo).includes(tag);
  }
  return todo.text.toLowerCase().includes(lower);
}

function noteMatches(content: string, query: string): boolean {
  if (!query) return true;
  if (query.startsWith("#")) return false;
  return content.toLowerCase().includes(query.toLowerCase());
}

function App() {
  const [state, setState] = useState<WebviewState | null>(null);
  const [todosCollapsed, setTodosCollapsed] = useState(false);
  const [filter, setFilter] = useState("");
  const focusAddRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case "stateUpdate":
          setState(message.state);
          break;
        case "focusAddInput":
          focusAddRef.current = true;
          break;
        case "focusSearch":
          searchRef.current?.focus();
          break;
      }
    };
    window.addEventListener("message", handler);
    // Signal readiness
    post({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!state) return null;

  const scope = state.scope;
  const query = filter.trim();
  const groups = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const filteredTodos = state.activeTodos.filter((todo) =>
    todoMatches(todo, query),
  );
  const filteredNotes = (state.notes || []).filter((note) =>
    noteMatches(note.content, query),
  );
  const visibleGroups = groups.filter((group) => {
    if (!query) return true;
    return filteredTodos.some((todo) => todo.groupId === group.id);
  });
  const tagCounts = new Map<string, number>();
  [...state.activeTodos, ...state.snoozedTodos].forEach((todo) => {
    tagsForTodo(todo).forEach((tag) =>
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1),
    );
  });
  const tags = [...tagCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const currentTask = state.activeTodos.find(
    (todo) => todo.id === state.currentTaskId,
  );

  return (
    <div id="app">
      <div class="scope-toggle" role="tablist" aria-label="Notes scope">
        {(["project", "global"] as Scope[]).map((option) => (
          <button
            key={option}
            class={option === scope ? "active" : ""}
            onClick={() => post({ type: "setActiveScope", scope: option })}
          >
            {option === "project" ? "Project" : "Global"}
          </button>
        ))}
      </div>

      <div class="filter-row">
        <input
          ref={searchRef}
          class="filter-input"
          type="search"
          placeholder="Search TODOs and notes, or #tag"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
        {filter && (
          <button class="filter-clear" onClick={() => setFilter("")}>
            Clear
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div class="tag-row">
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              class={`tag-chip${filter.toLowerCase() === `#${tag}` ? " active" : ""}`}
              onClick={() => setFilter(`#${tag}`)}
            >
              #{tag} <span>{count}</span>
            </button>
          ))}
        </div>
      )}

      {scope === "global" &&
        state.activeTodos.length === 0 &&
        state.snoozedTodos.length === 0 &&
        (state.notes || []).length === 0 && (
          <div class="empty-message global-empty">
            Global TODOs and notes are visible from every workspace.
          </div>
        )}

      <div class="group-section" id="todos-section">
        <SectionHeader
          title="TODOs"
          count={filteredTodos.length}
          collapsed={todosCollapsed}
          onToggle={() => setTodosCollapsed(!todosCollapsed)}
        />
        {!todosCollapsed && (
          <div class="section-content">
            {currentTask && !query && scope === "project" && (
              <div class="current-task-banner">
                <span>Current</span>
                <strong>{currentTask.text}</strong>
                <button
                  onClick={() => post({ type: "setCurrentTask", id: null })}
                >
                  Clear
                </button>
              </div>
            )}

            <TodoSection
              todos={filteredTodos}
              scope={scope}
              currentTaskId={state.currentTaskId}
              onToggle={(id) => scopedPost(scope, { type: "toggleTodo", id })}
              onEdit={(id, text) =>
                scopedPost(scope, { type: "editTodo", id, text })
              }
              onDelete={(id) => scopedPost(scope, { type: "deleteTodo", id })}
              onAdd={(text, groupId) =>
                scopedPost(scope, { type: "addTodo", text, groupId })
              }
              onReorder={(id, newGroupId, newSortOrder) =>
                scopedPost(scope, {
                  type: "reorderTodo",
                  id,
                  newGroupId,
                  newSortOrder,
                })
              }
              onSnooze={(id, until) =>
                scopedPost(scope, { type: "snoozeTodo", id, until })
              }
              onSetCurrentTask={(id) => post({ type: "setCurrentTask", id })}
            />

            <div id="groups-container">
              {visibleGroups.map((group) => (
                <GroupSection
                  key={group.id}
                  group={query ? { ...group, collapsed: false } : group}
                  todos={filteredTodos.filter((t) => t.groupId === group.id)}
                  scope={scope}
                  currentTaskId={state.currentTaskId}
                  onToggle={(id) =>
                    scopedPost(scope, { type: "toggleTodo", id })
                  }
                  onEdit={(id, text) =>
                    scopedPost(scope, { type: "editTodo", id, text })
                  }
                  onDelete={(id) =>
                    scopedPost(scope, { type: "deleteTodo", id })
                  }
                  onAdd={(text, groupId) =>
                    scopedPost(scope, { type: "addTodo", text, groupId })
                  }
                  onReorder={(id, newGroupId, newSortOrder) =>
                    scopedPost(scope, {
                      type: "reorderTodo",
                      id,
                      newGroupId,
                      newSortOrder,
                    })
                  }
                  onSnooze={(id, until) =>
                    scopedPost(scope, { type: "snoozeTodo", id, until })
                  }
                  onSetCurrentTask={(id) =>
                    post({ type: "setCurrentTask", id })
                  }
                  onRenameGroup={(id, name) =>
                    scopedPost(scope, { type: "renameGroup", id, name })
                  }
                  onDeleteGroup={(id) =>
                    scopedPost(scope, { type: "deleteGroup", id })
                  }
                  onToggleCollapse={(id) => {
                    if (!query) {
                      scopedPost(scope, { type: "toggleGroupCollapse", id });
                    }
                  }}
                  onReorderGroup={(id, newSortOrder) =>
                    scopedPost(scope, {
                      type: "reorderGroup",
                      id,
                      newSortOrder,
                    })
                  }
                />
              ))}
            </div>

            <GroupManagement
              onAddGroup={(name) =>
                scopedPost(scope, { type: "addGroup", name })
              }
            />

            <SnoozedSection
              snoozedTodos={state.snoozedTodos.filter((todo) =>
                todoMatches(todo, query),
              )}
              groups={state.groups}
              onWake={(id) => scopedPost(scope, { type: "unsnoozeTodo", id })}
              onDelete={(id) => scopedPost(scope, { type: "deleteTodo", id })}
            />

            <ArchiveSection
              archivedTodos={state.archivedTodos}
              groups={state.groups}
              onRestore={(id) => scopedPost(scope, { type: "restoreTodo", id })}
              onDelete={(id) => scopedPost(scope, { type: "deleteTodo", id })}
            />
          </div>
        )}
      </div>

      <NotesSection
        notes={filteredNotes}
        onAdd={(content) => scopedPost(scope, { type: "addNote", content })}
        onEdit={(id, content) =>
          scopedPost(scope, { type: "editNote", id, content })
        }
        onDelete={(id) => scopedPost(scope, { type: "deleteNote", id })}
      />
    </div>
  );
}

render(<App />, document.getElementById("root")!);
