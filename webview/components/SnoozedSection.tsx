import type { TodoGroup, TodoItem as TodoItemType } from "../types";

import { DisclosureSection } from "./DisclosureSection";
import { MarkdownContent } from "./MarkdownContent";
import { ActionMenu, type ActionMenuItem } from "./ui/ActionMenu";
import { IconButton } from "./ui/IconButton";

interface SnoozedSectionProps {
  snoozedTodos: TodoItemType[];
  groups: TodoGroup[];
  onWake: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatWake(timestamp?: number): string {
  if (!timestamp) return "";
  const milliseconds = timestamp - Date.now();
  if (milliseconds <= 0) return "Ready now";
  const minutes = Math.ceil(milliseconds / (1000 * 60));
  if (minutes < 60) return `Wakes in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `Wakes in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `Wakes in ${days}d`;
}

export function SnoozedSection({
  snoozedTodos,
  groups,
  onWake,
  onDelete,
}: SnoozedSectionProps) {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));

  return (
    <DisclosureSection title="Snoozed" count={snoozedTodos.length} icon="clock">
      {snoozedTodos.length === 0 ? (
        <div class="section-empty compact">No snoozed tasks</div>
      ) : (
        <div class="state-list">
          {snoozedTodos.map((todo) => {
            const menuItems: ActionMenuItem[] = [
              {
                label: "Delete",
                icon: "trash",
                danger: true,
                onSelect: () => onDelete(todo.id),
              },
            ];
            return (
              <article key={todo.id} class="state-item snoozed-item">
                <div class="state-item-content">
                  <MarkdownContent
                    content={todo.text}
                    className="state-item-text"
                  />
                  <div class="item-meta">
                    <span>{formatWake(todo.snoozedUntil)}</span>
                    {todo.groupId && (
                      <span>{groupNames.get(todo.groupId) || "Group"}</span>
                    )}
                  </div>
                </div>
                <div class="item-actions state-item-actions">
                  <IconButton
                    icon="refresh"
                    label="Wake now"
                    onClick={() => onWake(todo.id)}
                  />
                  <ActionMenu items={menuItems} label="Snoozed task actions" />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DisclosureSection>
  );
}
