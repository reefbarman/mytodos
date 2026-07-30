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
import { IconButton } from "./components/ui/IconButton";
import { NotesSection } from "./components/NotesSection";
import { SectionHeader } from "./components/SectionHeader";
import { SnoozedSection } from "./components/SnoozedSection";
import { TodoSection } from "./components/TodoSection";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
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
  if (lower.startsWith("#")) return tagsForTodo(todo).includes(lower.slice(1));
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
  const [createdNotes, setCreatedNotes] = useState<
    Array<{ id: string; scope: Scope }>
  >([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "stateUpdate") {
        setState(message.state);
        setCreatedNotes((notes) =>
          notes.filter((note) => note.scope === message.state.scope),
        );
      }
      if (message.type === "noteCreated") {
        setCreatedNotes((notes) => [
          ...notes,
          { id: message.id, scope: message.scope },
        ]);
      }
      if (message.type === "focusSearch") searchRef.current?.focus();
      if (message.type === "focusAddInput") {
        setTodosCollapsed(false);
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLButtonElement>(".primary-task-add")
            ?.click(),
        );
      }
    };
    window.addEventListener("message", handler);
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
  const createdNoteIds = createdNotes
    .filter((note) => note.scope === scope)
    .map((note) => note.id);
  const filteredNotes = state.notes.filter(
    (note) =>
      createdNoteIds.includes(note.id) || noteMatches(note.content, query),
  );
  const visibleGroups = groups.filter(
    (group) =>
      !query || filteredTodos.some((todo) => todo.groupId === group.id),
  );
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
  const visibleTaskCount = filteredTodos.length;
  const isEmpty =
    state.activeTodos.length === 0 &&
    state.snoozedTodos.length === 0 &&
    state.notes.length === 0;

  return (
    <div id="app">
      <WorkspaceToolbar
        scope={scope}
        filter={filter}
        tags={tags}
        searchRef={searchRef}
        onScopeChange={(nextScope) =>
          post({ type: "setActiveScope", scope: nextScope })
        }
        onFilterChange={setFilter}
      />

      <main class="workspace-content">
        {scope === "global" && isEmpty && (
          <div class="scope-empty-hint">
            Global tasks and notes are available from every workspace.
          </div>
        )}

        {currentTask && !query && scope === "project" && (
          <div class="current-task-strip">
            <span class="current-task-label">Current task</span>
            <span class="current-task-text">{currentTask.text}</span>
            <IconButton
              icon="close"
              label="Clear current task"
              onClick={() => post({ type: "setCurrentTask", id: null })}
            />
          </div>
        )}

        <section class="workspace-section tasks-section">
          <SectionHeader
            title="Tasks"
            count={visibleTaskCount}
            collapsed={todosCollapsed}
            onToggle={() => setTodosCollapsed(!todosCollapsed)}
          />
          {!todosCollapsed && (
            <div class="section-content">
              {query && visibleTaskCount === 0 && (
                <div class="section-empty">No tasks match “{query}”.</div>
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

              <div id="groups-container" class="groups-container">
                {visibleGroups.map((group) => (
                  <GroupSection
                    key={group.id}
                    group={query ? { ...group, collapsed: false } : group}
                    todos={filteredTodos.filter(
                      (todo) => todo.groupId === group.id,
                    )}
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

              {!query && (
                <GroupManagement
                  onAddGroup={(name) =>
                    scopedPost(scope, { type: "addGroup", name })
                  }
                />
              )}

              <div class="task-state-sections">
                <SnoozedSection
                  snoozedTodos={state.snoozedTodos.filter((todo) =>
                    todoMatches(todo, query),
                  )}
                  groups={state.groups}
                  onWake={(id) =>
                    scopedPost(scope, { type: "unsnoozeTodo", id })
                  }
                  onDelete={(id) =>
                    scopedPost(scope, { type: "deleteTodo", id })
                  }
                />
                <ArchiveSection
                  archivedTodos={state.archivedTodos}
                  groups={state.groups}
                  onRestore={(id) =>
                    scopedPost(scope, { type: "restoreTodo", id })
                  }
                  onDelete={(id) =>
                    scopedPost(scope, { type: "deleteTodo", id })
                  }
                />
              </div>
            </div>
          )}
        </section>

        <NotesSection
          notes={filteredNotes}
          createdNoteIds={createdNoteIds}
          onAdd={(content) => scopedPost(scope, { type: "addNote", content })}
          onCreatedNoteOpened={(id) =>
            setCreatedNotes((notes) =>
              notes.filter((note) => note.id !== id || note.scope !== scope),
            )
          }
          onEdit={(id, content) =>
            scopedPost(scope, { type: "editNote", id, content })
          }
          onDelete={(id) => scopedPost(scope, { type: "deleteNote", id })}
        />
      </main>
    </div>
  );
}

render(<App />, document.getElementById("root")!);
