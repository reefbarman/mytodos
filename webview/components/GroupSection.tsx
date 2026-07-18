import type { Scope, TodoGroup, TodoItem as TodoItemType } from "../types";
import { useEffect, useRef, useState } from "preact/hooks";

import { InlineAddInput } from "./InlineAddInput";
import { SectionHeader } from "./SectionHeader";
import { TodoItem } from "./TodoItem";
import { setupDropZone } from "../hooks/useDragAndDrop";

interface GroupSectionProps {
  group: TodoGroup;
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
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onReorderGroup: (id: string, newSortOrder: number) => void;
}

export function GroupSection({
  group,
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
  onRenameGroup,
  onDeleteGroup,
  onToggleCollapse,
  onReorderGroup,
}: GroupSectionProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [groupName, setGroupName] = useState(group.name);

  useEffect(() => {
    if (listRef.current && !group.collapsed) {
      setupDropZone(listRef.current, onReorder);
    }
  }, [group.collapsed]);

  useEffect(() => {
    setGroupName(group.name);
  }, [group.name]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  // Group drag-and-drop for reordering groups
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const handleDragOver = (e: DragEvent) => {
      if (
        !(window as any).__draggedGroupId ||
        (window as any).__draggedGroupId === group.id
      )
        return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    };

    const handleDrop = (e: DragEvent) => {
      const draggedGroupId = (window as any).__draggedGroupId;
      if (!draggedGroupId) return;
      e.preventDefault();
      const container = document.getElementById("groups-container");
      if (!container) return;
      const sections = [...container.querySelectorAll(".group-section")];
      const targetIndex = sections.indexOf(section);
      onReorderGroup(draggedGroupId, targetIndex);
    };

    section.addEventListener("dragover", handleDragOver);
    section.addEventListener("drop", handleDrop);
    return () => {
      section.removeEventListener("dragover", handleDragOver);
      section.removeEventListener("drop", handleDrop);
    };
  }, [group.id]);

  const sorted = todos.sort((a, b) => a.sortOrder - b.sortOrder);

  const startRename = (e: MouseEvent) => {
    e.stopPropagation();
    setGroupName(group.name);
    setRenaming(true);
  };

  const commitRename = () => {
    const trimmed = groupName.trim();
    if (trimmed && trimmed !== group.name) {
      onRenameGroup(group.id, trimmed);
    } else {
      setGroupName(group.name);
    }
    setRenaming(false);
  };

  const cancelRename = () => {
    setGroupName(group.name);
    setRenaming(false);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDeleteGroup(group.id);
  };

  const actions = (
    <>
      <button
        class="group-action-btn"
        title="Rename"
        onClick={startRename}
        dangerouslySetInnerHTML={{ __html: "&#9998;" }}
      />
      <button
        class="group-action-btn"
        title="Delete group (TODOs move to Ungrouped)"
        onClick={handleDelete}
        dangerouslySetInnerHTML={{ __html: "&times;" }}
      />
    </>
  );

  return (
    <div ref={sectionRef} class="group-section" data-group-id={group.id}>
      <SectionHeader
        title={group.name}
        count={sorted.length}
        collapsed={group.collapsed}
        onToggle={() => onToggleCollapse(group.id)}
        titleContent={
          renaming ? (
            <input
              ref={inputRef}
              type="text"
              class="group-name-edit"
              value={groupName}
              onClick={(e) => e.stopPropagation()}
              onInput={(e) =>
                setGroupName((e.target as HTMLInputElement).value)
              }
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
              }}
            />
          ) : undefined
        }
        draggable={!renaming}
        actions={actions}
        onDragStart={(e) => {
          (window as any).__draggedGroupId = group.id;
          (window as any).__draggedTodoId = null;
          e.dataTransfer!.effectAllowed = "move";
          e.dataTransfer!.setData("text/plain", group.id);
          sectionRef.current?.classList.add("group-dragging");
        }}
        onDragEnd={() => {
          (window as any).__draggedGroupId = null;
          sectionRef.current?.classList.remove("group-dragging");
        }}
      />
      {!group.collapsed && (
        <div
          ref={listRef}
          class="group-todo-list todo-list"
          data-group-id={group.id}
        >
          {sorted.map((todo) => (
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
          <InlineAddInput groupId={group.id} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}
