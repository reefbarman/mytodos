import type { TodoGroup, TodoItem as TodoItemType } from "../types";

interface SnoozedSectionProps {
  snoozedTodos: TodoItemType[];
  groups: TodoGroup[];
  onWake: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatWake(timestamp?: number): string {
  if (!timestamp) return "";
  const ms = timestamp - Date.now();
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / (1000 * 60));
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `in ${days}d`;
}

export function SnoozedSection({
  snoozedTodos,
  groups,
  onWake,
  onDelete,
}: SnoozedSectionProps) {
  const groupNameMap: Record<string, string> = {};
  groups.forEach((group) => {
    groupNameMap[group.id] = group.name;
  });

  return (
    <details id="snoozed-section">
      <summary>
        <span
          class="archive-chevron"
          dangerouslySetInnerHTML={{ __html: "&#9654;" }}
        />
        <span class="archive-label">Snoozed</span>
        <span class="archive-badge">{snoozedTodos.length}</span>
      </summary>
      <div id="snoozed-list">
        {snoozedTodos.length === 0 ? (
          <div class="empty-message">No snoozed items</div>
        ) : (
          snoozedTodos.map((todo) => (
            <div key={todo.id} class="archive-item snoozed-item">
              <button
                class="archive-action-btn"
                title="Wake now"
                onClick={() => onWake(todo.id)}
                dangerouslySetInnerHTML={{ __html: "&#8634;" }}
              />
              <span class="archive-text">{todo.text}</span>
              {todo.groupId && (
                <span class="archive-age">
                  {groupNameMap[todo.groupId] || "Group"}
                </span>
              )}
              <span class="archive-age">{formatWake(todo.snoozedUntil)}</span>
              <button
                class="archive-action-btn"
                title="Delete"
                onClick={() => onDelete(todo.id)}
                dangerouslySetInnerHTML={{ __html: "&times;" }}
              />
            </div>
          ))
        )}
      </div>
    </details>
  );
}
