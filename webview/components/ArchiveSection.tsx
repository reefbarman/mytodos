import type { TodoItem as TodoItemType, TodoGroup } from "../types";

interface ArchiveSectionProps {
  archivedTodos: TodoItemType[];
  groups: TodoGroup[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatAge(timestamp?: number): string {
  if (!timestamp) return "";
  const ms = Date.now() - timestamp;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function ArchiveSection({
  archivedTodos,
  groups,
  onRestore,
  onDelete,
}: ArchiveSectionProps) {
  // Build group name lookup
  const groupNameMap: Record<string, string> = {};
  groups.forEach((g) => {
    groupNameMap[g.id] = g.name;
  });

  // Group archived todos by their original groupId
  const grouped: Record<string, TodoItemType[]> = {};
  archivedTodos.forEach((todo) => {
    const gid = todo.groupId || "";
    if (!grouped[gid]) grouped[gid] = [];
    grouped[gid].push(todo);
  });

  // Render order: ungrouped first, then groups in sort order
  const orderedGroupIds = [""];
  groups.forEach((g) => {
    if (grouped[g.id]) orderedGroupIds.push(g.id);
  });
  // Include orphaned group IDs
  Object.keys(grouped).forEach((gid) => {
    if (!orderedGroupIds.includes(gid)) orderedGroupIds.push(gid);
  });

  const multipleGroups = orderedGroupIds.filter((id) => grouped[id]).length > 1;

  return (
    <details id="archive-section">
      <summary>
        <span
          class="archive-chevron"
          dangerouslySetInnerHTML={{ __html: "&#9654;" }}
        />
        <span class="archive-label">Completed</span>
        <span class="archive-badge">{archivedTodos.length}</span>
      </summary>
      <div id="archive-list">
        {archivedTodos.length === 0 ? (
          <div class="empty-message">No archived items</div>
        ) : (
          orderedGroupIds.map((gid) => {
            const todos = grouped[gid];
            if (!todos) return null;
            const groupLabel =
              gid === "" ? "TODOs" : groupNameMap[gid] || "Deleted Group";
            return (
              <>
                {multipleGroups && (
                  <div class="archive-group-header">{groupLabel}</div>
                )}
                {todos.map((todo) => (
                  <div key={todo.id} class="archive-item">
                    <input
                      type="checkbox"
                      class="todo-checkbox"
                      checked
                      title="Uncheck to restore"
                      onChange={() => onRestore(todo.id)}
                    />
                    <span class="archive-text">{todo.text}</span>
                    <span class="archive-age">
                      {formatAge(todo.completedAt)}
                    </span>
                    <button
                      class="archive-action-btn"
                      title="Delete permanently"
                      onClick={() => onDelete(todo.id)}
                      dangerouslySetInnerHTML={{ __html: "&times;" }}
                    />
                  </div>
                ))}
              </>
            );
          })
        )}
      </div>
    </details>
  );
}
