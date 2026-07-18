import type { TodoGroup, TodoItem as TodoItemType } from "../types";

import { DisclosureSection } from "./DisclosureSection";
import { MarkdownContent } from "./MarkdownContent";
import { ActionMenu, type ActionMenuItem } from "./ui/ActionMenu";

interface ArchiveSectionProps {
  archivedTodos: TodoItemType[];
  groups: TodoGroup[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatAge(timestamp?: number): string {
  if (!timestamp) return "";
  const milliseconds = Date.now() - timestamp;
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  if (hours < 1) return "Completed just now";
  if (hours < 24) return `Completed ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Completed ${days}d ago`;
}

export function ArchiveSection({
  archivedTodos,
  groups,
  onRestore,
  onDelete,
}: ArchiveSectionProps) {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  return (
    <DisclosureSection
      title="Completed"
      count={archivedTodos.length}
      icon="check"
    >
      {archivedTodos.length === 0 ? (
        <div class="section-empty compact">No completed tasks</div>
      ) : (
        <div class="state-list">
          {archivedTodos.map((todo) => {
            const menuItems: ActionMenuItem[] = [
              {
                label: "Delete permanently",
                icon: "trash",
                danger: true,
                onSelect: () => onDelete(todo.id),
              },
            ];
            return (
              <article key={todo.id} class="state-item completed-item">
                <input
                  type="checkbox"
                  class="todo-checkbox state-marker"
                  checked
                  aria-label={`Restore ${todo.text}`}
                  title="Uncheck to restore"
                  onChange={() => onRestore(todo.id)}
                />
                <div class="state-item-content">
                  <MarkdownContent
                    content={todo.text}
                    className="state-item-text"
                  />
                  <div class="item-meta">
                    <span>{formatAge(todo.completedAt)}</span>
                    {todo.groupId && (
                      <span>
                        {groupNames.get(todo.groupId) || "Deleted group"}
                      </span>
                    )}
                  </div>
                </div>
                <div class="item-actions state-item-actions">
                  <ActionMenu
                    items={menuItems}
                    label="Completed task actions"
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DisclosureSection>
  );
}
