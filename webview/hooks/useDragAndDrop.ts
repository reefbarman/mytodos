export function setupDropZone(
  listEl: HTMLElement,
  onReorder: (todoId: string, groupId: string, newSortOrder: number) => void
) {
  listEl.addEventListener('dragover', (e) => {
    if (!(window as any).__draggedTodoId) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    // Remove old indicators
    document.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());

    // Show drop indicator
    const afterElement = getDragAfterElement(listEl, e.clientY);
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    if (afterElement == null) {
      listEl.appendChild(indicator);
    } else {
      listEl.insertBefore(indicator, afterElement);
    }
  });

  listEl.addEventListener('dragleave', (e) => {
    if (!listEl.contains(e.relatedTarget as Node)) {
      listEl.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
    }
  });

  listEl.addEventListener('drop', (e) => {
    e.preventDefault();
    document.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
    const draggedTodoId = (window as any).__draggedTodoId;
    if (!draggedTodoId) return;

    const groupId = listEl.dataset.groupId || '';
    const afterElement = getDragAfterElement(listEl, e.clientY);
    const items = [...listEl.querySelectorAll('.todo-item')].filter(
      el => (el as HTMLElement).dataset.todoId !== draggedTodoId
    );

    let newIndex: number;
    if (afterElement == null) {
      newIndex = items.length;
    } else {
      newIndex = items.indexOf(afterElement);
      if (newIndex === -1) newIndex = items.length;
    }

    onReorder(draggedTodoId, groupId, newIndex);
  });
}

function getDragAfterElement(container: HTMLElement, y: number): Element | undefined {
  const elements = [...container.querySelectorAll('.todo-item:not(.dragging)')];
  return elements.reduce<{ offset: number; element?: Element }>(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}
