import { useRef, useEffect } from "preact/hooks";
import type { TodoItem as TodoItemType } from "../types";
import { TodoItem } from "./TodoItem";
import { InlineAddInput } from "./InlineAddInput";
import { setupDropZone } from "../hooks/useDragAndDrop";

interface TodoSectionProps {
  todos: TodoItemType[];
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAdd: (text: string, groupId: string) => void;
  onReorder: (id: string, newGroupId: string, newSortOrder: number) => void;
}

export function TodoSection({
  todos,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
  onReorder,
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
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      <InlineAddInput groupId="" onAdd={onAdd} />
    </div>
  );
}
