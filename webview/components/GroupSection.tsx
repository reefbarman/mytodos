import type { Scope, TodoGroup, TodoItem as TodoItemType } from "../types";
import { useEffect, useRef, useState } from "preact/hooks";

import { setupDropZone } from "../hooks/useDragAndDrop";
import { InlineAddInput } from "./InlineAddInput";
import { SectionHeader } from "./SectionHeader";
import { TodoItem } from "./TodoItem";
import { ActionMenu, type ActionMenuItem } from "./ui/ActionMenu";

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
  const sectionRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [groupName, setGroupName] = useState(group.name);

  useEffect(() => {
    if (listRef.current && !group.collapsed) {
      setupDropZone(listRef.current, onReorder);
    }
  }, [group.collapsed]);

  useEffect(() => setGroupName(group.name), [group.name]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const handleDragOver = (event: DragEvent) => {
      if (
        !(window as any).__draggedGroupId ||
        (window as any).__draggedGroupId === group.id
      ) {
        return;
      }
      event.preventDefault();
      event.dataTransfer!.dropEffect = "move";
    };

    const handleDrop = (event: DragEvent) => {
      const draggedGroupId = (window as any).__draggedGroupId;
      if (!draggedGroupId) return;
      event.preventDefault();
      const container = document.getElementById("groups-container");
      if (!container) return;
      const sections = [...container.querySelectorAll(".workspace-group")];
      onReorderGroup(draggedGroupId, sections.indexOf(section));
    };

    section.addEventListener("dragover", handleDragOver);
    section.addEventListener("drop", handleDrop);
    return () => {
      section.removeEventListener("dragover", handleDragOver);
      section.removeEventListener("drop", handleDrop);
    };
  }, [group.id]);

  const sorted = [...todos].sort((a, b) => a.sortOrder - b.sortOrder);

  const commitRename = () => {
    const trimmed = groupName.trim();
    if (trimmed && trimmed !== group.name) onRenameGroup(group.id, trimmed);
    else setGroupName(group.name);
    setRenaming(false);
  };

  const menuItems: ActionMenuItem[] = [
    { label: "Rename", icon: "edit", onSelect: () => setRenaming(true) },
    {
      label: "Delete group",
      icon: "trash",
      danger: true,
      onSelect: () => onDeleteGroup(group.id),
    },
  ];

  return (
    <section ref={sectionRef} class="workspace-group" data-group-id={group.id}>
      <SectionHeader
        title={group.name}
        icon="folder"
        count={sorted.length}
        collapsed={group.collapsed}
        onToggle={() => onToggleCollapse(group.id)}
        titleContent={
          renaming ? (
            <input
              ref={inputRef}
              type="text"
              class="section-title-input"
              value={groupName}
              onClick={(event) => event.stopPropagation()}
              onInput={(event) =>
                setGroupName((event.target as HTMLInputElement).value)
              }
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setGroupName(group.name);
                  setRenaming(false);
                }
                if (event.key === "Enter") commitRename();
              }}
            />
          ) : undefined
        }
        draggable={!renaming}
        actions={
          <ActionMenu items={menuItems} label={`${group.name} actions`} />
        }
        onDragStart={(event) => {
          (window as any).__draggedGroupId = group.id;
          (window as any).__draggedTodoId = null;
          event.dataTransfer!.effectAllowed = "move";
          event.dataTransfer!.setData("text/plain", group.id);
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
          class="todo-list group-todo-list"
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
          <InlineAddInput groupId={group.id} onAdd={onAdd} label="Add task" />
        </div>
      )}
    </section>
  );
}
