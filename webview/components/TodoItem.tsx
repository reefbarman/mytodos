import type { Scope, TodoItem as TodoItemType } from "../types";
import { useState } from "preact/hooks";

import { stripMarkdownImages } from "../markdown";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownEditor } from "./MarkdownEditor";
import { SnoozeMenu } from "./SnoozeMenu";
import { ActionMenu, type ActionMenuItem } from "./ui/ActionMenu";
import { IconButton } from "./ui/IconButton";

interface TodoItemProps {
  todo: TodoItemType;
  scope?: Scope;
  currentTaskId?: string;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onSnooze?: (id: string, until: number) => void;
  onSetCurrentTask?: (id: string | null) => void;
}

export function TodoItem({
  todo,
  scope = "project",
  currentTaskId,
  onToggle,
  onEdit,
  onDelete,
  onSnooze,
  onSetCurrentTask,
}: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [copied, setCopied] = useState(false);
  const isCurrentTask = currentTaskId === todo.id;

  const startEdit = () => {
    setEditText(todo.text);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onEdit(todo.id, trimmed);
    }
    setEditing(false);
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(stripMarkdownImages(todo.text));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const moreItems: ActionMenuItem[] = [
    { label: "Edit", icon: "edit", onSelect: startEdit },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      onSelect: () => onDelete(todo.id),
    },
  ];

  return (
    <div
      class={`todo-item${isCurrentTask ? " current-task" : ""}${editing ? " todo-editing" : ""}`}
      data-todo-id={todo.id}
      data-group-id={todo.groupId}
      draggable={!editing}
      onDragStart={(event) => {
        if (editing) return;
        event.stopPropagation();
        const dragEvent = event as DragEvent;
        (window as any).__draggedTodoId = todo.id;
        (window as any).__draggedGroupId = null;
        dragEvent.dataTransfer!.effectAllowed = "move";
        dragEvent.dataTransfer!.setData("text/plain", todo.id);
        (event.currentTarget as HTMLElement).classList.add("dragging");
      }}
      onDragEnd={(event) => {
        (window as any).__draggedTodoId = null;
        (event.currentTarget as HTMLElement).classList.remove("dragging");
        document
          .querySelectorAll(".drop-indicator")
          .forEach((indicator) => indicator.remove());
      }}
    >
      <input
        type="checkbox"
        class="todo-checkbox"
        checked={todo.done}
        aria-label={`Complete ${todo.text}`}
        onChange={() => onToggle(todo.id)}
      />
      <div class="todo-body">
        {editing ? (
          <MarkdownEditor
            value={editText}
            onChange={setEditText}
            onCommit={commitEdit}
            onCancel={() => setEditing(false)}
            placeholder="Describe the task…"
            className="todo-edit-input"
            autoFocus
            commitLabel="Save"
            compact
          />
        ) : (
          <MarkdownContent
            content={todo.text}
            className="todo-text"
            onDblClick={startEdit}
          />
        )}
        {!editing && (
          <div class="item-actions todo-actions-row">
            {scope === "project" &&
              onSetCurrentTask &&
              !todo.done &&
              !todo.snoozedUntil && (
                <IconButton
                  icon="pin"
                  label={
                    isCurrentTask ? "Clear current task" : "Set as current task"
                  }
                  active={isCurrentTask}
                  onClick={() =>
                    onSetCurrentTask(isCurrentTask ? null : todo.id)
                  }
                />
              )}
            {onSnooze && !todo.done && !todo.snoozedUntil && (
              <SnoozeMenu onSnooze={(until) => onSnooze(todo.id, until)} />
            )}
            <ActionMenu items={moreItems} label="Task actions" />
            <IconButton
              icon={copied ? "check" : "copy"}
              label={
                copied ? "Task text copied" : "Copy task text without images"
              }
              class="primary-copy-action"
              onClick={() => void copyText()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
