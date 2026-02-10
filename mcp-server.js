#!/usr/bin/env node
/**
 * MCP Server for My TODOs VS Code Extension
 * Uses the official @modelcontextprotocol/sdk.
 * Reads/writes .vscode/.mytodos.json in the current working directory.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

const { version } = require('./package.json');

const STATE_FILE = path.join(process.cwd(), '.vscode', '.mytodos.json');
const SCHEMA_VERSION = 1;

// ---- State helpers ----

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const state = JSON.parse(data);
      if (state && Array.isArray(state.todos) && Array.isArray(state.groups)) {
        return state;
      }
    }
  } catch { /* ignore */ }
  return { todos: [], groups: [], schemaVersion: SCHEMA_VERSION };
}

function writeState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function findTodo(todos, { id, text_match }) {
  if (id) {
    return todos.find(t => t.id === id);
  }
  if (text_match) {
    const lower = text_match.toLowerCase();
    return todos.find(t => t.text.toLowerCase() === lower)
      || todos.find(t => t.text.toLowerCase().includes(lower));
  }
  return undefined;
}

function formatTodos(todos, groups) {
  const grouped = {};
  for (const todo of todos) {
    const groupName = todo.groupId
      ? (groups.find(g => g.id === todo.groupId)?.name || 'Unknown')
      : 'Ungrouped';
    if (!grouped[groupName]) { grouped[groupName] = []; }
    grouped[groupName].push(todo);
  }
  const lines = [];
  for (const [groupName, items] of Object.entries(grouped)) {
    if (Object.keys(grouped).length > 1) {
      lines.push(`[${groupName}]`);
    }
    for (const todo of items) {
      lines.push(`  - ${todo.text} (id: ${todo.id})`);
    }
  }
  return lines.join('\n');
}

// ---- Server setup ----

const server = new McpServer({
  name: 'mytodos',
  version,
});

// ---- Tools ----

server.tool(
  'list_todos',
  'List active (not completed) TODOs. Optionally filter by group name.',
  { group_name: z.string().optional().describe('Filter by group name') },
  async ({ group_name }) => {
    const state = readState();
    let todos = state.todos.filter(t => !t.done);
    if (group_name) {
      const group = state.groups.find(g => g.name.toLowerCase() === group_name.toLowerCase());
      if (group) {
        todos = todos.filter(t => t.groupId === group.id);
      } else {
        return { content: [{ type: 'text', text: `No group found with name "${group_name}". Active TODOs:\n${formatTodos(todos, state.groups)}` }] };
      }
    }
    todos.sort((a, b) => a.sortOrder - b.sortOrder);
    if (todos.length === 0) {
      return { content: [{ type: 'text', text: 'No active TODOs.' }] };
    }
    return { content: [{ type: 'text', text: formatTodos(todos, state.groups) }] };
  }
);

server.tool(
  'list_completed_todos',
  'List completed (done) TODOs. Optionally filter by group name.',
  { group_name: z.string().optional().describe('Filter by group name') },
  async ({ group_name }) => {
    const state = readState();
    let todos = state.todos.filter(t => t.done);
    if (group_name) {
      const group = state.groups.find(g => g.name.toLowerCase() === group_name.toLowerCase());
      if (group) {
        todos = todos.filter(t => t.groupId === group.id);
      } else {
        return { content: [{ type: 'text', text: `No group found with name "${group_name}".` }] };
      }
    }
    todos.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    if (todos.length === 0) {
      return { content: [{ type: 'text', text: 'No completed TODOs.' }] };
    }
    return { content: [{ type: 'text', text: formatTodos(todos, state.groups) }] };
  }
);

server.tool(
  'add_todo',
  'Add a new TODO item.',
  {
    text: z.string().describe('The TODO text'),
    group_name: z.string().optional().describe('Group name to add to (defaults to ungrouped)'),
  },
  async ({ text, group_name }) => {
    const state = readState();
    let groupId = '';
    if (group_name) {
      const group = state.groups.find(g => g.name.toLowerCase() === group_name.toLowerCase());
      if (group) {
        groupId = group.id;
      } else {
        return { content: [{ type: 'text', text: `Group "${group_name}" not found. Use list_groups to see available groups, or add_group to create one.` }], isError: true };
      }
    }
    const todosInGroup = state.todos.filter(t => t.groupId === groupId && !t.done);
    state.todos.push({
      id: generateId(),
      text,
      done: false,
      createdAt: Date.now(),
      groupId,
      sortOrder: todosInGroup.length,
    });
    writeState(state);
    const name = groupId ? state.groups.find(g => g.id === groupId)?.name : 'Ungrouped';
    return { content: [{ type: 'text', text: `Added TODO: "${text}" (${name})` }] };
  }
);

server.tool(
  'complete_todo',
  'Mark a TODO as completed. Matches by text (case-insensitive substring match).',
  {
    text_match: z.string().optional().describe('Text to match against TODO items'),
    id: z.string().optional().describe('Exact TODO id (preferred over text_match)'),
  },
  async ({ text_match, id }) => {
    const state = readState();
    const todo = findTodo(state.todos.filter(t => !t.done), { id, text_match });
    if (!todo) {
      return { content: [{ type: 'text', text: `No active TODO found matching "${id || text_match}".` }], isError: true };
    }
    todo.done = true;
    todo.completedAt = Date.now();
    writeState(state);
    return { content: [{ type: 'text', text: `Completed: "${todo.text}"` }] };
  }
);

server.tool(
  'uncomplete_todo',
  'Restore a completed TODO back to active. Matches by text (case-insensitive substring match).',
  {
    text_match: z.string().optional().describe('Text to match against completed TODO items'),
    id: z.string().optional().describe('Exact TODO id (preferred over text_match)'),
  },
  async ({ text_match, id }) => {
    const state = readState();
    const todo = findTodo(state.todos.filter(t => t.done), { id, text_match });
    if (!todo) {
      return { content: [{ type: 'text', text: `No completed TODO found matching "${id || text_match}".` }], isError: true };
    }
    todo.done = false;
    todo.completedAt = undefined;
    const todosInGroup = state.todos.filter(t => t.groupId === todo.groupId && !t.done && t.id !== todo.id);
    todo.sortOrder = todosInGroup.length;
    writeState(state);
    return { content: [{ type: 'text', text: `Restored: "${todo.text}"` }] };
  }
);

server.tool(
  'delete_todo',
  'Permanently delete a TODO item. Matches by text (case-insensitive substring match).',
  {
    text_match: z.string().optional().describe('Text to match against TODO items'),
    id: z.string().optional().describe('Exact TODO id (preferred over text_match)'),
  },
  async ({ text_match, id }) => {
    const state = readState();
    const todo = findTodo(state.todos, { id, text_match });
    if (!todo) {
      return { content: [{ type: 'text', text: `No TODO found matching "${id || text_match}".` }], isError: true };
    }
    state.todos = state.todos.filter(t => t.id !== todo.id);
    writeState(state);
    return { content: [{ type: 'text', text: `Deleted: "${todo.text}"` }] };
  }
);

server.tool(
  'list_groups',
  'List all TODO groups.',
  {},
  async () => {
    const state = readState();
    const groups = state.groups.sort((a, b) => a.sortOrder - b.sortOrder);
    if (groups.length === 0) {
      return { content: [{ type: 'text', text: 'No groups. All TODOs are ungrouped.' }] };
    }
    const lines = groups.map(g => {
      const count = state.todos.filter(t => t.groupId === g.id && !t.done).length;
      return `- ${g.name} (${count} active)`;
    });
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

server.tool(
  'add_group',
  'Create a new TODO group.',
  { name: z.string().describe('Group name') },
  async ({ name }) => {
    const state = readState();
    const exists = state.groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      return { content: [{ type: 'text', text: `Group "${name}" already exists.` }], isError: true };
    }
    state.groups.push({
      id: generateId(),
      name,
      sortOrder: state.groups.length,
      collapsed: false,
    });
    writeState(state);
    return { content: [{ type: 'text', text: `Created group: "${name}"` }] };
  }
);

server.tool(
  'edit_todo',
  'Edit a TODO item\'s text. Find by id (preferred) or text match.',
  {
    text_match: z.string().optional().describe('Text to match against TODO items'),
    id: z.string().optional().describe('Exact TODO id (preferred over text_match)'),
    new_text: z.string().describe('The new text for the TODO'),
  },
  async ({ text_match, id, new_text }) => {
    const state = readState();
    const todo = findTodo(state.todos, { id, text_match });
    if (!todo) {
      return { content: [{ type: 'text', text: `No TODO found matching "${id || text_match}".` }], isError: true };
    }
    const oldText = todo.text;
    todo.text = new_text;
    writeState(state);
    return { content: [{ type: 'text', text: `Renamed: "${oldText}" → "${new_text}"` }] };
  }
);

server.tool(
  'move_todo',
  'Move a TODO to a different group. Find by id (preferred) or text match.',
  {
    text_match: z.string().optional().describe('Text to match against TODO items'),
    id: z.string().optional().describe('Exact TODO id (preferred over text_match)'),
    group_name: z.string().optional().describe('Target group name (omit to move to ungrouped)'),
  },
  async ({ text_match, id, group_name }) => {
    const state = readState();
    const todo = findTodo(state.todos, { id, text_match });
    if (!todo) {
      return { content: [{ type: 'text', text: `No TODO found matching "${id || text_match}".` }], isError: true };
    }
    let newGroupId = '';
    let targetName = 'Ungrouped';
    if (group_name) {
      const group = state.groups.find(g => g.name.toLowerCase() === group_name.toLowerCase());
      if (!group) {
        return { content: [{ type: 'text', text: `Group "${group_name}" not found.` }], isError: true };
      }
      newGroupId = group.id;
      targetName = group.name;
    }
    const todosInTarget = state.todos.filter(t => t.groupId === newGroupId && !t.done && t.id !== todo.id);
    todo.groupId = newGroupId;
    todo.sortOrder = todosInTarget.length;
    writeState(state);
    return { content: [{ type: 'text', text: `Moved "${todo.text}" → ${targetName}` }] };
  }
);

server.tool(
  'rename_group',
  'Rename a TODO group.',
  {
    old_name: z.string().describe('Current group name'),
    new_name: z.string().describe('New group name'),
  },
  async ({ old_name, new_name }) => {
    const state = readState();
    const group = state.groups.find(g => g.name.toLowerCase() === old_name.toLowerCase());
    if (!group) {
      return { content: [{ type: 'text', text: `Group "${old_name}" not found.` }], isError: true };
    }
    const conflict = state.groups.find(g => g.name.toLowerCase() === new_name.toLowerCase() && g.id !== group.id);
    if (conflict) {
      return { content: [{ type: 'text', text: `Group "${new_name}" already exists.` }], isError: true };
    }
    group.name = new_name;
    writeState(state);
    return { content: [{ type: 'text', text: `Renamed group: "${old_name}" → "${new_name}"` }] };
  }
);

server.tool(
  'delete_group',
  'Delete a TODO group. TODOs in the group are moved to ungrouped.',
  {
    name: z.string().describe('Group name to delete'),
  },
  async ({ name }) => {
    const state = readState();
    const group = state.groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (!group) {
      return { content: [{ type: 'text', text: `Group "${name}" not found.` }], isError: true };
    }
    const affected = state.todos.filter(t => t.groupId === group.id);
    for (const todo of affected) {
      todo.groupId = '';
    }
    state.groups = state.groups.filter(g => g.id !== group.id);
    writeState(state);
    const msg = affected.length > 0
      ? `Deleted group "${name}". ${affected.length} TODO(s) moved to ungrouped.`
      : `Deleted group "${name}".`;
    return { content: [{ type: 'text', text: msg }] };
  }
);

// ---- Start ----

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP server error: ${err.message}\n`);
  process.exit(1);
});
