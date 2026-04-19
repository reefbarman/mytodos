import { useRef, useEffect } from 'preact/hooks';
import type { TodoItem as TodoItemType, TodoGroup } from '../types';
import { SectionHeader } from './SectionHeader';
import { TodoItem } from './TodoItem';
import { InlineAddInput } from './InlineAddInput';
import { setupDropZone } from '../hooks/useDragAndDrop';

interface GroupSectionProps {
  group: TodoGroup;
  todos: TodoItemType[];
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAdd: (text: string, groupId: string) => void;
  onReorder: (id: string, newGroupId: string, newSortOrder: number) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onReorderGroup: (id: string, newSortOrder: number) => void;
}

export function GroupSection({
  group, todos, onToggle, onEdit, onDelete, onAdd, onReorder,
  onRenameGroup, onDeleteGroup, onToggleCollapse, onReorderGroup
}: GroupSectionProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current && !group.collapsed) {
      setupDropZone(listRef.current, onReorder);
    }
  }, [group.collapsed]);

  // Group drag-and-drop for reordering groups
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const handleDragOver = (e: DragEvent) => {
      if (!(window as any).__draggedGroupId || (window as any).__draggedGroupId === group.id) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
    };

    const handleDrop = (e: DragEvent) => {
      const draggedGroupId = (window as any).__draggedGroupId;
      if (!draggedGroupId) return;
      e.preventDefault();
      const container = document.getElementById('groups-container');
      if (!container) return;
      const sections = [...container.querySelectorAll('.group-section')];
      const targetIndex = sections.indexOf(section);
      onReorderGroup(draggedGroupId, targetIndex);
    };

    section.addEventListener('dragover', handleDragOver);
    section.addEventListener('drop', handleDrop);
    return () => {
      section.removeEventListener('dragover', handleDragOver);
      section.removeEventListener('drop', handleDrop);
    };
  }, [group.id]);

  const sorted = todos.sort((a, b) => a.sortOrder - b.sortOrder);

  const handleRename = (e: MouseEvent) => {
    e.stopPropagation();
    const newName = prompt('Rename group:', group.name);
    if (newName && newName.trim()) {
      onRenameGroup(group.id, newName.trim());
    }
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDeleteGroup(group.id);
  };

  const actions = (
    <>
      <button class="group-action-btn" title="Rename" onClick={handleRename} dangerouslySetInnerHTML={{ __html: '&#9998;' }} />
      <button class="group-action-btn" title="Delete group (TODOs move to Ungrouped)" onClick={handleDelete} dangerouslySetInnerHTML={{ __html: '&times;' }} />
    </>
  );

  return (
    <div ref={sectionRef} class="group-section" data-group-id={group.id}>
      <SectionHeader
        title={group.name}
        count={sorted.length}
        collapsed={group.collapsed}
        onToggle={() => onToggleCollapse(group.id)}
        draggable
        actions={actions}
        onDragStart={(e) => {
          (window as any).__draggedGroupId = group.id;
          (window as any).__draggedTodoId = null;
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/plain', group.id);
          sectionRef.current?.classList.add('group-dragging');
        }}
        onDragEnd={() => {
          (window as any).__draggedGroupId = null;
          sectionRef.current?.classList.remove('group-dragging');
        }}
      />
      {!group.collapsed && (
        <div ref={listRef} class="group-todo-list todo-list" data-group-id={group.id}>
          {sorted.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          <InlineAddInput groupId={group.id} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}
