// @ts-nocheck
(function () {
  const vscode = acquireVsCodeApi();

  let currentState = null;
  let draggedTodoId = null;
  let draggedGroupId = null;
  let previousArchivedCount = 0;

  // ---- MESSAGE HANDLING ----

  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'stateUpdate':
        currentState = message.state;
        render(currentState);
        break;
      case 'focusAddInput':
        showInlineAddInput('', document.getElementById('ungrouped-list'));
        break;
    }
  });

  // Signal readiness
  vscode.postMessage({ type: 'ready' });

  // ---- RENDERING ----

  function render(state) {
    renderUngrouped(state.activeTodos.filter(t => t.groupId === ''));
    renderGroups(state.groups, state.activeTodos);
    renderArchive(state.archivedTodos, state.groups);
  }

  function createInlineAddButton(groupId, listEl) {
    const btn = document.createElement('button');
    btn.className = 'inline-add-btn';
    btn.textContent = '+ Add TODO';
    btn.addEventListener('click', () => {
      btn.style.display = 'none';
      showInlineAddInput(groupId, listEl, btn);
    });
    return btn;
  }

  function renderUngrouped(todos) {
    const container = document.getElementById('ungrouped-container');
    container.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'group-section';

    const header = document.createElement('div');
    header.className = 'group-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'group-name';
    nameSpan.textContent = 'TODOs';

    const countSpan = document.createElement('span');
    countSpan.className = 'group-count';
    countSpan.textContent = `(${todos.length})`;

    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    section.appendChild(header);

    const list = document.createElement('div');
    list.id = 'ungrouped-list';
    list.className = 'group-todo-list todo-list';
    list.dataset.groupId = '';
    const sorted = todos.sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.forEach(todo => {
      list.appendChild(createTodoElement(todo));
    });
    setupDropZone(list);
    section.appendChild(list);

    list.appendChild(createInlineAddButton('', list));

    container.appendChild(section);
  }

  function renderGroups(groups, allTodos) {
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.forEach(group => {
      const groupTodos = allTodos
        .filter(t => t.groupId === group.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      container.appendChild(createGroupElement(group, groupTodos));
    });
  }

  function createGroupElement(group, todos) {
    const section = document.createElement('div');
    section.className = 'group-section';
    section.dataset.groupId = group.id;

    const header = document.createElement('div');
    header.className = 'group-header';
    header.draggable = true;

    const collapseToggle = document.createElement('span');
    collapseToggle.className = 'collapse-toggle';
    collapseToggle.innerHTML = group.collapsed ? '&#9654;' : '&#9660;';
    collapseToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'toggleGroupCollapse', id: group.id });
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'group-name';
    nameSpan.textContent = group.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'group-count';
    countSpan.textContent = `(${todos.length})`;

    const renameBtn = document.createElement('button');
    renameBtn.className = 'group-action-btn';
    renameBtn.title = 'Rename';
    renameBtn.innerHTML = '&#9998;';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newName = prompt('Rename group:', group.name);
      if (newName && newName.trim()) {
        vscode.postMessage({ type: 'renameGroup', id: group.id, name: newName.trim() });
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'group-action-btn';
    deleteBtn.title = 'Delete group (TODOs move to Ungrouped)';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'deleteGroup', id: group.id });
    });

    header.appendChild(collapseToggle);
    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    header.appendChild(renameBtn);
    header.appendChild(deleteBtn);

    // Group drag-and-drop
    header.addEventListener('dragstart', (e) => {
      draggedGroupId = group.id;
      draggedTodoId = null;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', group.id);
      section.classList.add('group-dragging');
    });

    header.addEventListener('dragend', () => {
      draggedGroupId = null;
      section.classList.remove('group-dragging');
    });

    section.addEventListener('dragover', (e) => {
      if (!draggedGroupId || draggedGroupId === group.id) { return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    section.addEventListener('drop', (e) => {
      if (!draggedGroupId) { return; }
      e.preventDefault();
      const container = document.getElementById('groups-container');
      const sections = [...container.querySelectorAll('.group-section')];
      const targetIndex = sections.indexOf(section);
      vscode.postMessage({
        type: 'reorderGroup',
        id: draggedGroupId,
        newSortOrder: targetIndex,
      });
    });

    section.appendChild(header);

    if (!group.collapsed) {
      const list = document.createElement('div');
      list.className = 'group-todo-list todo-list';
      list.dataset.groupId = group.id;
      todos.forEach(todo => {
        list.appendChild(createTodoElement(todo));
      });
      setupDropZone(list);
      list.appendChild(createInlineAddButton(group.id, list));
      section.appendChild(list);
    }

    return section;
  }

  function createTodoElement(todo) {
    const el = document.createElement('div');
    el.className = 'todo-item';
    el.dataset.todoId = todo.id;
    el.dataset.groupId = todo.groupId;
    el.draggable = true;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = todo.done;
    checkbox.addEventListener('change', () => {
      vscode.postMessage({ type: 'toggleTodo', id: todo.id });
    });

    const textSpan = document.createElement('span');
    textSpan.className = 'todo-text';
    textSpan.textContent = todo.text;

    // Inline edit on double-click
    textSpan.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'todo-edit-input';
      input.value = todo.text;
      textSpan.replaceWith(input);
      input.focus();
      input.select();

      let committed = false;
      const commit = () => {
        if (committed) { return; }
        committed = true;
        const newText = input.value.trim();
        if (newText && newText !== todo.text) {
          vscode.postMessage({ type: 'editTodo', id: todo.id, text: newText });
        } else {
          // Re-render to restore original
          vscode.postMessage({ type: 'ready' });
        }
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { commit(); }
        if (ev.key === 'Escape') { vscode.postMessage({ type: 'ready' }); }
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'todo-delete-btn';
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'deleteTodo', id: todo.id });
    });

    el.appendChild(checkbox);
    el.appendChild(textSpan);
    el.appendChild(deleteBtn);

    // Todo drag
    el.addEventListener('dragstart', (e) => {
      e.stopPropagation(); // prevent group drag
      draggedTodoId = todo.id;
      draggedGroupId = null;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', todo.id);
      el.classList.add('dragging');
    });

    el.addEventListener('dragend', () => {
      draggedTodoId = null;
      el.classList.remove('dragging');
      // Clean up any drop indicators
      document.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
    });

    return el;
  }

  // ---- DRAG AND DROP: TODOS ----

  function setupDropZone(listEl) {
    listEl.addEventListener('dragover', (e) => {
      if (!draggedTodoId) { return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

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
      // Only remove if leaving the actual list (not entering a child)
      if (!listEl.contains(e.relatedTarget)) {
        listEl.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
      }
    });

    listEl.addEventListener('drop', (e) => {
      e.preventDefault();
      document.querySelectorAll('.drop-indicator').forEach(ind => ind.remove());
      if (!draggedTodoId) { return; }

      const groupId = listEl.dataset.groupId;
      // Calculate the drop position based on element positions
      const afterElement = getDragAfterElement(listEl, e.clientY);
      const items = [...listEl.querySelectorAll('.todo-item')].filter(
        el => el.dataset.todoId !== draggedTodoId
      );

      let newIndex;
      if (afterElement == null) {
        newIndex = items.length;
      } else {
        newIndex = items.indexOf(afterElement);
        if (newIndex === -1) { newIndex = items.length; }
      }

      vscode.postMessage({
        type: 'reorderTodo',
        id: draggedTodoId,
        newGroupId: groupId,
        newSortOrder: newIndex,
      });
    });
  }

  function getDragAfterElement(container, y) {
    const elements = [...container.querySelectorAll('.todo-item:not(.dragging)')];
    return elements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // ---- ARCHIVE ----

  function renderArchive(archivedTodos, groups) {
    document.getElementById('archive-count').textContent = archivedTodos.length;
    const list = document.getElementById('archive-list');
    list.innerHTML = '';

    // Auto-expand when a new item was just completed
    if (archivedTodos.length > previousArchivedCount) {
      document.getElementById('archive-section').open = true;
    }
    previousArchivedCount = archivedTodos.length;

    if (archivedTodos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-message';
      empty.textContent = 'No archived items';
      list.appendChild(empty);
      return;
    }

    // Build group name lookup
    const groupNameMap = {};
    groups.forEach(g => { groupNameMap[g.id] = g.name; });

    // Group archived todos by their original groupId
    const grouped = {};
    archivedTodos.forEach(todo => {
      const gid = todo.groupId || '';
      if (!grouped[gid]) { grouped[gid] = []; }
      grouped[gid].push(todo);
    });

    // Render order: ungrouped ("TODOs") first, then groups in their sort order
    const orderedGroupIds = [''];
    groups.forEach(g => {
      if (grouped[g.id]) { orderedGroupIds.push(g.id); }
    });
    // Include any orphaned group IDs (group was deleted after todo was completed)
    Object.keys(grouped).forEach(gid => {
      if (!orderedGroupIds.includes(gid)) { orderedGroupIds.push(gid); }
    });

    orderedGroupIds.forEach(gid => {
      const todos = grouped[gid];
      if (!todos) { return; }

      const groupLabel = gid === '' ? 'TODOs' : (groupNameMap[gid] || 'Deleted Group');

      // Only show group header if there are multiple groups with archived items
      if (orderedGroupIds.filter(id => grouped[id]).length > 1) {
        const header = document.createElement('div');
        header.className = 'archive-group-header';
        header.textContent = groupLabel;
        list.appendChild(header);
      }

      todos.forEach(todo => {
        const el = document.createElement('div');
        el.className = 'archive-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-checkbox';
        checkbox.checked = true;
        checkbox.title = 'Uncheck to restore';
        checkbox.addEventListener('change', () => {
          vscode.postMessage({ type: 'restoreTodo', id: todo.id });
        });

        const textSpan = document.createElement('span');
        textSpan.className = 'archive-text';
        textSpan.textContent = todo.text;

        const ageSpan = document.createElement('span');
        ageSpan.className = 'archive-age';
        ageSpan.textContent = formatAge(todo.completedAt);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'archive-action-btn';
        deleteBtn.title = 'Delete permanently';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'deleteTodo', id: todo.id });
        });

        el.appendChild(checkbox);
        el.appendChild(textSpan);
        el.appendChild(ageSpan);
        el.appendChild(deleteBtn);
        list.appendChild(el);
      });
    });
  }

  function formatAge(timestamp) {
    if (!timestamp) { return ''; }
    const ms = Date.now() - timestamp;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 1) { return 'just now'; }
    if (hours < 24) { return hours === 1 ? '1 hour ago' : `${hours} hours ago`; }
    const days = Math.floor(hours / 24);
    if (days === 1) { return '1 day ago'; }
    return `${days} days ago`;
  }

  // ---- INLINE ADD ----

  function showInlineAddInput(groupId, listEl, addBtn) {
    // If already showing an inline input in this list, just focus it
    const existing = listEl.querySelector('.todo-add-inline');
    if (existing) { existing.focus(); return; }

    // Hide the add button while input is showing
    if (addBtn) { addBtn.style.display = 'none'; }

    // Remove empty messages while adding
    listEl.querySelectorAll('.empty-message').forEach(el => el.remove());

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-add-inline';
    input.placeholder = 'Add a TODO...';
    listEl.appendChild(input);
    input.focus();

    let committed = false;
    const commit = () => {
      if (committed) { return; }
      committed = true;
      const text = input.value.trim();
      if (text) {
        vscode.postMessage({ type: 'addTodo', text, groupId });
      } else {
        input.remove();
        if (addBtn) { addBtn.style.display = ''; }
      }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { commit(); }
      if (ev.key === 'Escape') { committed = true; input.remove(); if (addBtn) { addBtn.style.display = ''; } }
    });
  }

  // ---- ADD GROUP ----

  document.getElementById('add-group-btn').addEventListener('click', addGroup);
  document.getElementById('group-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { addGroup(); }
  });

  function addGroup() {
    const input = document.getElementById('group-input');
    const name = input.value.trim();
    if (!name) { return; }
    vscode.postMessage({ type: 'addGroup', name });
    input.value = '';
  }
})();
