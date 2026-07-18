import type { Scope, TodoItem as TodoItemType } from "../types";

import { MarkdownContent } from "./MarkdownContent";
import { MarkdownEditor } from "./MarkdownEditor";
import { stripMarkdownImages } from "../markdown";
import { useState } from "preact/hooks";

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

function tomorrowAt(hour: number): number {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

function nextMondayAt(hour: number): number {
  const date = new Date();
  const day = date.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
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
  const [snoozeOpen, setSnoozeOpen] = useState(false);
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

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard.writeText(stripMarkdownImages(todo.text));
    btn.innerHTML = "&#10003;";
    setTimeout(() => {
      btn.innerHTML = "&#128203;";
    }, 1200);
  };

  const snoozeUntil = (until: number) => {
    if (until > Date.now()) {
      onSnooze?.(todo.id, until);
    }
    setSnoozeOpen(false);
  };

  const handleCustomSnooze = () => {
    const value = prompt("Snooze until (YYYY-MM-DD HH:mm)");
    if (!value) return;
    const timestamp = new Date(value.replace(" ", "T")).getTime();
    if (Number.isFinite(timestamp) && timestamp > Date.now()) {
      snoozeUntil(timestamp);
    }
  };

  return (
    <div
      class={`todo-item${isCurrentTask ? " current-task" : ""}${editing ? " todo-editing" : ""}`}
      data-todo-id={todo.id}
      data-group-id={todo.groupId}
      draggable={!editing}
      onDragStart={(e) => {
        if (editing) return;
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
      <div class="todo-body">
        {editing ? (
          <MarkdownEditor
            value={editText}
            onChange={setEditText}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            placeholder="Edit TODO... Paste/drop screenshots or use Markdown."
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
          <div class="todo-actions-row">
            {scope === "project" &&
              onSetCurrentTask &&
              !todo.done &&
              !todo.snoozedUntil && (
                <button
                  class="todo-action-btn todo-pin-btn"
                  title={
                    isCurrentTask ? "Clear current task" : "Set as current task"
                  }
                  onClick={() =>
                    onSetCurrentTask(isCurrentTask ? null : todo.id)
                  }
                  dangerouslySetInnerHTML={{
                    __html: isCurrentTask ? "&#128204;" : "&#128205;",
                  }}
                />
              )}
            {onSnooze && !todo.done && !todo.snoozedUntil && (
              <div class="todo-snooze-menu">
                <button
                  class="todo-action-btn todo-snooze-btn"
                  title="Snooze"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSnoozeOpen(!snoozeOpen);
                  }}
                  dangerouslySetInnerHTML={{ __html: "&#128337;" }}
                />
                {snoozeOpen && (
                  <div
                    class="snooze-popover"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        snoozeUntil(Date.now() + 4 * 60 * 60 * 1000)
                      }
                    >
                      Later today
                      <span>+4h</span>
                    </button>
                    <button onClick={() => snoozeUntil(tomorrowAt(9))}>
                      Tomorrow
                      <span>9am</span>
                    </button>
                    <button onClick={() => snoozeUntil(nextMondayAt(9))}>
                      Next week
                      <span>Mon 9am</span>
                    </button>
                    <button onClick={handleCustomSnooze}>Custom…</button>
                  </div>
                )}
              </div>
            )}
            <button
              class="todo-action-btn todo-copy-btn"
              title="Copy text without images"
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
        )}
      </div>
    </div>
  );
}
