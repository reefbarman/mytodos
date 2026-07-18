import type { Scope, TodoItem as TodoItemType } from "../types";
import { useEffect, useRef } from "preact/hooks";

import { InlineAddInput } from "./InlineAddInput";
import { TodoItem } from "./TodoItem";
import { setupDropZone } from "../hooks/useDragAndDrop";

interface TodoSectionProps {
  todos: TodoItemType[];
  scope: Scope;
  currentTaskId?: string;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAdd: (text: string, groupId: string) => void;
  onReorder: (id: string, newGroupId: string, newSortOrder: number) => void;
  onSnooze: (id: string, until: number) => void;
  onSetCurrentTask: (id: string | null) => void;
}

export function TodoSection({
  todos,
  scope,
  currentTaskId,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
  onReorder,
  onSnooze,
  onSetCurrentTask,
}: TodoSectionProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      setupDropZone(listRef.current, onReorder);
    }
  }, []);

  const ungrouped = todos
    .filter((t) => t.groupId === "")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div ref={listRef} class="group-todo-list todo-list" data-group-id="">
      {ungrouped.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          scope={scope}
          currentTaskId={currentTaskId}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onSnooze={onSnooze}
          onSetCurrentTask={onSetCurrentTask}
        />
      ))}
      <InlineAddInput groupId="" onAdd={onAdd} />
    </div>
  );
}
