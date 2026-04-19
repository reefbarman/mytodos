import { useState, useRef } from "preact/hooks";
import type { TodoItem as TodoItemType } from "../types";

interface TodoItemProps {
  todo: TodoItemType;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onEdit, onDelete }: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const committedRef = useRef(false);

  const startEdit = () => {
    setEditText(todo.text);
    committedRef.current = false;
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(todo.text.length, todo.text.length);
    }, 0);
  };

  const commitEdit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onEdit(todo.id, trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    committedRef.current = true;
    setEditing(false);
  };

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard.writeText(todo.text);
    btn.innerHTML = "&#10003;";
    setTimeout(() => {
      btn.innerHTML = "&#128203;";
    }, 1200);
  };

  return (
    <div
      class="todo-item"
      data-todo-id={todo.id}
      data-group-id={todo.groupId}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        const ev = e as DragEvent;
        (window as any).__draggedTodoId = todo.id;
        (window as any).__draggedGroupId = null;
        ev.dataTransfer!.effectAllowed = "move";
        ev.dataTransfer!.setData("text/plain", todo.id);
        (e.currentTarget as HTMLElement).classList.add("dragging");
      }}
      onDragEnd={(e) => {
        (window as any).__draggedTodoId = null;
        (e.currentTarget as HTMLElement).classList.remove("dragging");
        document
          .querySelectorAll(".drop-indicator")
          .forEach((ind) => ind.remove());
      }}
    >
      <input
        type="checkbox"
        class="todo-checkbox"
        checked={todo.done}
        onChange={() => onToggle(todo.id)}
      />
      {editing ? (
        <textarea
          ref={inputRef}
          class="todo-edit-input"
          value={editText}
          onInput={(e) => setEditText((e.target as HTMLTextAreaElement).value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
              return;
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commitEdit();
            }
          }}
        />
      ) : (
        <span class="todo-text" onDblClick={startEdit}>
          {todo.text}
        </span>
      )}
      <button
        class="todo-action-btn todo-copy-btn"
        title="Copy text"
        onClick={handleCopy}
        dangerouslySetInnerHTML={{ __html: "&#128203;" }}
      />
      <button
        class="todo-action-btn todo-delete-btn"
        title="Delete"
        onClick={() => onDelete(todo.id)}
        dangerouslySetInnerHTML={{ __html: "&times;" }}
      />
    </div>
  );
}
