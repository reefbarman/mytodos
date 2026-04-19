#!/usr/bin/env node
/**
 * MCP Server for My Dev Notes VS Code Extension
 * Uses the official @modelcontextprotocol/sdk.
 * Reads/writes ~/.mydevnotes/data.json, keyed by workspace path (process.cwd()).
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { version } = require("./package.json");

const GLOBAL_DIR = path.join(os.homedir(), ".mydevnotes");
const GLOBAL_FILE = path.join(GLOBAL_DIR, "data.json");
const WORKSPACE_KEY = process.cwd();
const SCHEMA_VERSION = 2;

// ---- State helpers ----

function readState() {
  try {
    if (fs.existsSync(GLOBAL_FILE)) {
      const data = fs.readFileSync(GLOBAL_FILE, "utf-8");
      const globalData = JSON.parse(data);
      const state = globalData[WORKSPACE_KEY];
      if (state && Array.isArray(state.todos) && Array.isArray(state.groups)) {
        // Ensure notes array exists (schema migration)
        if (!Array.isArray(state.notes)) {
          state.notes = [];
          state.schemaVersion = SCHEMA_VERSION;
        }
        return state;
      }
    }
  } catch {
    /* ignore */
  }
  return { todos: [], groups: [], notes: [], schemaVersion: SCHEMA_VERSION };
}

function writeState(state) {
  if (!fs.existsSync(GLOBAL_DIR)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  }
  let globalData = {};
  try {
    if (fs.existsSync(GLOBAL_FILE)) {
      globalData = JSON.parse(fs.readFileSync(GLOBAL_FILE, "utf-8"));
    }
  } catch {
    globalData = {};
  }
  globalData[WORKSPACE_KEY] = state;
  fs.writeFileSync(GLOBAL_FILE, JSON.stringify(globalData, null, 2), "utf-8");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function findTodo(todos, { id, text_match }) {
  if (id) {
    return todos.find((t) => t.id === id);
  }
  if (text_match) {
    const lower = text_match.toLowerCase();
    return (
      todos.find((t) => t.text.toLowerCase() === lower) ||
      todos.find((t) => t.text.toLowerCase().includes(lower))
    );
  }
  return undefined;
}

function findNote(notes, { id, content_match }) {
  if (id) {
    return notes.find((n) => n.id === id);
  }
  if (content_match) {
    const lower = content_match.toLowerCase();
    return notes.find((n) => n.content.toLowerCase().includes(lower));
  }
  return undefined;
}

/** Normalize literal \n sequences to real newlines (MCP transports may escape them) */
function normalizeNewlines(str) {
  return str.replace(/\\n/g, "\n");
}

function formatTodos(todos, groups, { inlineGroup = false } = {}) {
  if (inlineGroup) {
    return todos
      .map((todo) => {
        const groupName = todo.groupId
          ? groups.find((g) => g.id === todo.groupId)?.name || "Unknown"
          : null;
        const groupTag = groupName ? ` [${groupName}]` : "";
        return `  - ${todo.text}${groupTag} (id: ${todo.id})`;
      })
      .join("\n");
  }
  const grouped = {};
  for (const todo of todos) {
    const groupName = todo.groupId
      ? groups.find((g) => g.id === todo.groupId)?.name || "Unknown"
      : "Ungrouped";
    if (!grouped[groupName]) {
      grouped[groupName] = [];
    }
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
  return lines.join("\n");
}

// ---- Server setup ----

const server = new McpServer({
  name: "mydevnotes",
  version,
});

// ---- TODO Tools ----

server.tool(
  "list_todos",
  "List active (not completed) TODOs. Optionally filter by group name.",
  { group_name: z.string().optional().describe("Filter by group name") },
  async ({ group_name }) => {
    const state = readState();
    let todos = state.todos.filter((t) => !t.done);
    if (group_name) {
      const group = state.groups.find(
        (g) => g.name.toLowerCase() === group_name.toLowerCase(),
      );
      if (group) {
        todos = todos.filter((t) => t.groupId === group.id);
      } else {
        return {
          content: [
            {
              type: "text",
              text: `No group found with name "${group_name}". Active TODOs:\n${formatTodos(todos, state.groups)}`,
            },
          ],
        };
      }
    }
    todos.sort((a, b) => a.sortOrder - b.sortOrder);
    if (todos.length === 0) {
      return { content: [{ type: "text", text: "No active TODOs." }] };
    }
    return {
      content: [{ type: "text", text: formatTodos(todos, state.groups) }],
    };
  },
);

server.tool(
  "list_completed_todos",
  "List completed (done) TODOs. Optionally filter by group name.",
  { group_name: z.string().optional().describe("Filter by group name") },
  async ({ group_name }) => {
    const state = readState();
    let todos = state.todos.filter((t) => t.done);
    if (group_name) {
      const group = state.groups.find(
        (g) => g.name.toLowerCase() === group_name.toLowerCase(),
      );
      if (group) {
        todos = todos.filter((t) => t.groupId === group.id);
      } else {
        return {
          content: [
            { type: "text", text: `No group found with name "${group_name}".` },
          ],
        };
      }
    }
    todos.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    if (todos.length === 0) {
      return { content: [{ type: "text", text: "No completed TODOs." }] };
    }
    return {
      content: [
        {
          type: "text",
          text: formatTodos(todos, state.groups, { inlineGroup: true }),
        },
      ],
    };
  },
);

const todoRef = z.object({
  text_match: z
    .string()
    .optional()
    .describe("Text to match (case-insensitive substring)"),
  id: z
    .string()
    .optional()
    .describe("Exact TODO id (preferred over text_match)"),
});

server.tool(
  "add_todo",
  "Add one or more TODO items.",
  {
    items: z
      .array(
        z.object({
          text: z.string().describe("The TODO text"),
          group_name: z
            .string()
            .optional()
            .describe("Group name (defaults to ungrouped)"),
        }),
      )
      .min(1)
      .describe("TODOs to add"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      let groupId = "";
      if (item.group_name) {
        const group = state.groups.find(
          (g) => g.name.toLowerCase() === item.group_name.toLowerCase(),
        );
        if (!group) {
          results.push(`FAIL: Group "${item.group_name}" not found`);
          continue;
        }
        groupId = group.id;
      }
      const todosInGroup = state.todos.filter(
        (t) => t.groupId === groupId && !t.done,
      );
      state.todos.push({
        id: generateId(),
        text: item.text,
        done: false,
        createdAt: Date.now(),
        groupId,
        sortOrder: todosInGroup.length,
      });
      const name = groupId
        ? state.groups.find((g) => g.id === groupId)?.name
        : "Ungrouped";
      results.push(`Added: "${item.text}" (${name})`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
);

server.tool(
  "complete_todo",
  "Mark one or more TODOs as completed. Match by id (preferred) or text.",
  {
    items: z.array(todoRef).min(1).describe("TODOs to complete"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      const todo = findTodo(
        state.todos.filter((t) => !t.done),
        item,
      );
      if (!todo) {
        results.push(
          `FAIL: No active TODO matching "${item.id || item.text_match}"`,
        );
        continue;
      }
      todo.done = true;
      todo.completedAt = Date.now();
      results.push(`Completed: "${todo.text}"`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
);

server.tool(
  "uncomplete_todo",
  "Restore one or more completed TODOs back to active. Match by id (preferred) or text.",
  {
    items: z.array(todoRef).min(1).describe("TODOs to restore"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      const todo = findTodo(
        state.todos.filter((t) => t.done),
        item,
      );
      if (!todo) {
        results.push(
          `FAIL: No completed TODO matching "${item.id || item.text_match}"`,
        );
        continue;
      }
      todo.done = false;
      todo.completedAt = undefined;
      const todosInGroup = state.todos.filter(
        (t) => t.groupId === todo.groupId && !t.done && t.id !== todo.id,
      );
      todo.sortOrder = todosInGroup.length;
      results.push(`Restored: "${todo.text}"`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
);

server.tool(
  "delete_todo",
  "Permanently delete one or more TODO items. Match by id (preferred) or text.",
  {
    items: z.array(todoRef).min(1).describe("TODOs to delete"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      const todo = findTodo(state.todos, item);
      if (!todo) {
        results.push(`FAIL: No TODO matching "${item.id || item.text_match}"`);
        continue;
      }
      state.todos = state.todos.filter((t) => t.id !== todo.id);
      results.push(`Deleted: "${todo.text}"`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
);

server.tool(
  "edit_todo",
  "Edit the text of one or more TODOs. Match by id (preferred) or text.",
  {
    items: z
      .array(
        todoRef.extend({
          new_text: z.string().describe("The new text for the TODO"),
        }),
      )
      .min(1)
      .describe("TODOs to edit"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      const todo = findTodo(state.todos, item);
      if (!todo) {
        results.push(`FAIL: No TODO matching "${item.id || item.text_match}"`);
        continue;
      }
      const oldText = todo.text;
      todo.text = item.new_text;
      results.push(`Edited: "${oldText}" → "${item.new_text}"`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
);

server.tool(
  "move_todo",
  "Move one or more TODOs to a different group. Match by id (preferred) or text.",
  {
    items: z
      .array(
        todoRef.extend({
          group_name: z
            .string()
            .optional()
            .describe("Target group name (omit to move to ungrouped)"),
        }),
      )
      .min(1)
      .describe("TODOs to move"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      const todo = findTodo(state.todos, item);
      if (!todo) {
        results.push(`FAIL: No TODO matching "${item.id || item.text_match}"`);
        continue;
      }
      let newGroupId = "";
      let targetName = "Ungrouped";
      if (item.group_name) {
        const group = state.groups.find(
          (g) => g.name.toLowerCase() === item.group_name.toLowerCase(),
        );
        if (!group) {
          results.push(`FAIL: Group "${item.group_name}" not found`);
          continue;
        }
        newGroupId = group.id;
        targetName = group.name;
      }
      const todosInTarget = state.todos.filter(
        (t) => t.groupId === newGroupId && !t.done && t.id !== todo.id,
      );
      todo.groupId = newGroupId;
      todo.sortOrder = todosInTarget.length;
      results.push(`Moved: "${todo.text}" → ${targetName}`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
);

// ---- Group Tools ----

server.tool("list_groups", "List all TODO groups.", {}, async () => {
  const state = readState();
  const groups = state.groups.sort((a, b) => a.sortOrder - b.sortOrder);
  if (groups.length === 0) {
    return {
      content: [{ type: "text", text: "No groups. All TODOs are ungrouped." }],
    };
  }
  const lines = groups.map((g) => {
    const count = state.todos.filter(
      (t) => t.groupId === g.id && !t.done,
    ).length;
    return `- ${g.name} (${count} active)`;
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

server.tool(
  "add_group",
  "Create a new TODO group.",
  { name: z.string().describe("Group name") },
  async ({ name }) => {
    const state = readState();
    const exists = state.groups.find(
      (g) => g.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      return {
        content: [{ type: "text", text: `Group "${name}" already exists.` }],
        isError: true,
      };
    }
    state.groups.push({
      id: generateId(),
      name,
      sortOrder: state.groups.length,
      collapsed: false,
    });
    writeState(state);
    return { content: [{ type: "text", text: `Created group: "${name}"` }] };
  },
);

server.tool(
  "rename_group",
  "Rename a TODO group.",
  {
    old_name: z.string().describe("Current group name"),
    new_name: z.string().describe("New group name"),
  },
  async ({ old_name, new_name }) => {
    const state = readState();
    const group = state.groups.find(
      (g) => g.name.toLowerCase() === old_name.toLowerCase(),
    );
    if (!group) {
      return {
        content: [{ type: "text", text: `Group "${old_name}" not found.` }],
        isError: true,
      };
    }
    const conflict = state.groups.find(
      (g) =>
        g.name.toLowerCase() === new_name.toLowerCase() && g.id !== group.id,
    );
    if (conflict) {
      return {
        content: [
          { type: "text", text: `Group "${new_name}" already exists.` },
        ],
        isError: true,
      };
    }
    group.name = new_name;
    writeState(state);
    return {
      content: [
        { type: "text", text: `Renamed group: "${old_name}" → "${new_name}"` },
      ],
    };
  },
);

server.tool(
  "delete_group",
  "Delete a TODO group. TODOs in the group are moved to ungrouped.",
  { name: z.string().describe("Group name to delete") },
  async ({ name }) => {
    const state = readState();
    const group = state.groups.find(
      (g) => g.name.toLowerCase() === name.toLowerCase(),
    );
    if (!group) {
      return {
        content: [{ type: "text", text: `Group "${name}" not found.` }],
        isError: true,
      };
    }
    const affected = state.todos.filter((t) => t.groupId === group.id);
    for (const todo of affected) {
      todo.groupId = "";
    }
    state.groups = state.groups.filter((g) => g.id !== group.id);
    writeState(state);
    const msg =
      affected.length > 0
        ? `Deleted group "${name}". ${affected.length} TODO(s) moved to ungrouped.`
        : `Deleted group "${name}".`;
    return { content: [{ type: "text", text: msg }] };
  },
);

// ---- Note Tools ----

const noteRef = z.object({
  content_match: z
    .string()
    .optional()
    .describe("Text to match in note content (case-insensitive substring)"),
  id: z
    .string()
    .optional()
    .describe("Exact note id (preferred over content_match)"),
});

server.tool(
  "list_notes",
  "List all notes. Shows a truncated preview of each note.",
  {},
  async () => {
    const state = readState();
    const notes = (state.notes || []).sort((a, b) => a.sortOrder - b.sortOrder);
    if (notes.length === 0) {
      return { content: [{ type: "text", text: "No notes." }] };
    }
    const lines = notes.map((n) => {
      const preview =
        n.content.length > 80 ? n.content.substring(0, 80) + "..." : n.content;
      const oneLine = preview.replace(/\n/g, " ");
      return `  - ${oneLine} (id: ${n.id})`;
    });
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.tool(
  "add_note",
  "Add a new note with markdown content.",
  {
    content: z.string().describe("The note content (supports markdown)"),
  },
  async ({ content }) => {
    const normalized = normalizeNewlines(content);
    const state = readState();
    const newNote = {
      id: generateId(),
      content: normalized,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sortOrder: (state.notes || []).length,
    };
    if (!state.notes) {
      state.notes = [];
    }
    state.notes.push(newNote);
    writeState(state);
    const preview =
      content.length > 60 ? content.substring(0, 60) + "..." : content;
    return {
      content: [
        { type: "text", text: `Added note: "${preview}" (id: ${newNote.id})` },
      ],
    };
  },
);

server.tool(
  "edit_note",
  "Edit the content of one or more notes. Match by id (preferred) or content.",
  {
    items: z
      .array(
        noteRef.extend({
          new_content: z.string().describe("The new content for the note"),
        }),
      )
      .min(1)
      .describe("Notes to edit"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      const note = findNote(state.notes || [], item);
      if (!note) {
        results.push(
          `FAIL: No note matching "${item.id || item.content_match}"`,
        );
        continue;
      }
      note.content = normalizeNewlines(item.new_content);
      note.updatedAt = Date.now();
      const preview =
        item.new_content.length > 60
          ? item.new_content.substring(0, 60) + "..."
          : item.new_content;
      results.push(`Edited note ${note.id}: "${preview}"`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
);

server.tool(
  "delete_note",
  "Permanently delete one or more notes. Match by id (preferred) or content.",
  {
    items: z.array(noteRef).min(1).describe("Notes to delete"),
  },
  async ({ items }) => {
    const state = readState();
    const results = [];
    for (const item of items) {
      const note = findNote(state.notes || [], item);
      if (!note) {
        results.push(
          `FAIL: No note matching "${item.id || item.content_match}"`,
        );
        continue;
      }
      state.notes = state.notes.filter((n) => n.id !== note.id);
      const preview =
        note.content.length > 60
          ? note.content.substring(0, 60) + "..."
          : note.content;
      results.push(`Deleted note: "${preview}"`);
    }
    writeState(state);
    return { content: [{ type: "text", text: results.join("\n") }] };
  },
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
