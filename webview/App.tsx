import { render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import type { WebviewState, VSCodeApi } from "./types";
import { SectionHeader } from "./components/SectionHeader";
import { TodoSection } from "./components/TodoSection";
import { GroupSection } from "./components/GroupSection";
import { GroupManagement } from "./components/GroupManagement";
import { ArchiveSection } from "./components/ArchiveSection";
import { NotesSection } from "./components/NotesSection";

const vscode: VSCodeApi = acquireVsCodeApi();

function post(message: any) {
  vscode.postMessage(message);
}

function App() {
  const [state, setState] = useState<WebviewState | null>(null);
  const [todosCollapsed, setTodosCollapsed] = useState(false);
  const focusAddRef = useRef(false);

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
      }
    };
    window.addEventListener("message", handler);
    // Signal readiness
    post({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!state) return null;

  const groups = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div id="app">
      <div class="group-section" id="todos-section">
        <SectionHeader
          title="TODOs"
          count={state.activeTodos.length}
          collapsed={todosCollapsed}
          onToggle={() => setTodosCollapsed(!todosCollapsed)}
        />
        {!todosCollapsed && (
          <div class="section-content">
            <TodoSection
              todos={state.activeTodos}
              onToggle={(id) => post({ type: "toggleTodo", id })}
              onEdit={(id, text) => post({ type: "editTodo", id, text })}
              onDelete={(id) => post({ type: "deleteTodo", id })}
              onAdd={(text, groupId) => post({ type: "addTodo", text, groupId })}
              onReorder={(id, newGroupId, newSortOrder) =>
                post({ type: "reorderTodo", id, newGroupId, newSortOrder })
              }
            />

            {groups.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                todos={state.activeTodos.filter((t) => t.groupId === group.id)}
                onToggle={(id) => post({ type: "toggleTodo", id })}
                onEdit={(id, text) => post({ type: "editTodo", id, text })}
                onDelete={(id) => post({ type: "deleteTodo", id })}
                onAdd={(text, groupId) =>
                  post({ type: "addTodo", text, groupId })
                }
                onReorder={(id, newGroupId, newSortOrder) =>
                  post({ type: "reorderTodo", id, newGroupId, newSortOrder })
                }
                onRenameGroup={(id, name) =>
                  post({ type: "renameGroup", id, name })
                }
                onDeleteGroup={(id) => post({ type: "deleteGroup", id })}
                onToggleCollapse={(id) =>
                  post({ type: "toggleGroupCollapse", id })
                }
                onReorderGroup={(id, newSortOrder) =>
                  post({ type: "reorderGroup", id, newSortOrder })
                }
              />
            ))}

            <GroupManagement
              onAddGroup={(name) => post({ type: "addGroup", name })}
            />

            <ArchiveSection
              archivedTodos={state.archivedTodos}
              groups={state.groups}
              onRestore={(id) => post({ type: "restoreTodo", id })}
              onDelete={(id) => post({ type: "deleteTodo", id })}
            />
          </div>
        )}
      </div>

      <NotesSection
        notes={state.notes || []}
        onAdd={(content) => post({ type: "addNote", content })}
        onEdit={(id, content) => post({ type: "editNote", id, content })}
        onDelete={(id) => post({ type: "deleteNote", id })}
      />
    </div>
  );
}

render(<App />, document.getElementById("root")!);
