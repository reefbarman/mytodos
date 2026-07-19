#!/usr/bin/env node
/**
 * MCP Server for My Dev Notes VS Code Extension
 * Uses the official @modelcontextprotocol/sdk.
 * Reads/writes ~/.mydevnotes/data.json, keyed by workspace path (process.cwd())
 * or the reserved global scope key.
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
const GLOBAL_SCOPE_KEY = "::global::";
const SCHEMA_VERSION = 3;
const TAG_RE = /#([\p{L}\d_-]+)/gu;

const scopeSchema = z
  .enum(["project", "global"])
  .optional()
  .describe(
    "Data scope: project (current workspace) or global (visible everywhere). Defaults to project.",
  );

// ---- State helpers ----

function emptyState() {
  return { todos: [], groups: [], notes: [], schemaVersion: SCHEMA_VERSION };
}

function stateKey(scope = "project") {
  return scope === "global" ? GLOBAL_SCOPE_KEY : WORKSPACE_KEY;
}

function isAppState(value) {
  return value && Array.isArray(value.todos) && Array.isArray(value.groups);
}

function migrateState(state, scope = "project") {
  state.notes = Array.isArray(state.notes) ? state.notes : [];
  state.schemaVersion = SCHEMA_VERSION;
  const now = Date.now();
  for (const todo of state.todos) {
    if (todo.done || (todo.snoozedUntil && todo.snoozedUntil <= now)) {
      todo.snoozedUntil = undefined;
    }
  }
  if (scope === "global") {
    state.currentTaskId = undefined;
  } else if (
    state.currentTaskId &&
    !state.todos.some(
      (todo) =>
        todo.id === state.currentTaskId &&
        !todo.done &&
        (!todo.snoozedUntil || todo.snoozedUntil <= Date.now()),
    )
  ) {
    state.currentTaskId = undefined;
  }
  return state;
}

function readState(scope = "project") {
  try {
    if (fs.existsSync(GLOBAL_FILE)) {
      const data = fs.readFileSync(GLOBAL_FILE, "utf-8");
      const globalData = JSON.parse(data);
      const state = globalData[stateKey(scope)];
      if (isAppState(state)) {
        return migrateState(state, scope);
      }
    }
  } catch {
    /* ignore */
  }
  return emptyState();
}

function writeState(state, scope = "project") {
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
  globalData[stateKey(scope)] = migrateState(state, scope);
  const tempFile = `${GLOBAL_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(globalData, null, 2), "utf-8");
  fs.renameSync(tempFile, GLOBAL_FILE);
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

// Keep in sync with webview/App.tsx tag parsing.
function tagsForTodo(todo) {
  const tags = new Set();
  for (const match of todo.text.matchAll(TAG_RE)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

function renumberGroup(state, groupId) {
  state.todos
    .filter((t) => t.groupId === groupId && !t.done && !t.snoozedUntil)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((todo, index) => {
      todo.sortOrder = index;
    });
}

function formatTodos(
  todos,
  groups,
  { inlineGroup = false, currentTaskId } = {},
) {
  if (inlineGroup) {
    return todos
      .map((todo) => {
        const groupName = todo.groupId
          ? groups.find((g) => g.id === todo.groupId)?.name || "Unknown"
          : null;
        const groupTag = groupName ? ` [${groupName}]` : "";
        const current = todo.id === currentTaskId ? " [current]" : "";
        const snoozed = todo.snoozedUntil
          ? ` [snoozed until ${new Date(todo.snoozedUntil).toLocaleString()}]`
          : "";
        return `  - ${todo.text}${groupTag}${current}${snoozed} (id: ${todo.id})`;
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
      const current = todo.id === currentTaskId ? " [current]" : "";
      const snoozed = todo.snoozedUntil
        ? ` [snoozed until ${new Date(todo.snoozedUntil).toLocaleString()}]`
        : "";
      lines.push(`  - ${todo.text}${current}${snoozed} (id: ${todo.id})`);
    }
  }
  return lines.join("\n");
}

function textResponse(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

// ---- Server setup ----

const server = new McpServer(
  {
    name: "mydevnotes",
    version,
  },
  {
    instructions:
      "My Dev Notes is the user's persistent TODO/task-list and notes store, with project-scoped and global data. When the user refers to 'my TODOs', 'my task list', 'my dev notes', 'my notes', or asks to list, add, update, complete, snooze, move, or delete them, use this server's tools unless the context clearly identifies source-code TODO comments or another task tracker. Project scope is the default and uses the current workspace; global scope is visible across workspaces. List items first when an exact id is not already known, then prefer ids for updates.",
  },
);

// ---- TODO Tools ----

server.tool(
  "list_todos",
  "List the user's active TODOs/tasks stored in My Dev Notes. Optionally filter by group, tag, and project/global scope.",
  {
    scope: scopeSchema,
    group_name: z.string().optional().describe("Filter by group name"),
    tag: z
      .string()
      .optional()
      .describe("Filter by #tag (case-insensitive, omit #)"),
    include_snoozed: z
      .boolean()
      .optional()
      .describe("Include snoozed TODOs. Defaults to false."),
  },
  async ({ scope = "project", group_name, tag, include_snoozed = false }) => {
    const state = readState(scope);
    const now = Date.now();
    let todos = state.todos.filter(
      (t) =>
        !t.done &&
        (include_snoozed || !t.snoozedUntil || t.snoozedUntil <= now),
    );
    if (group_name) {
      const group = state.groups.find(
        (g) => g.name.toLowerCase() === group_name.toLowerCase(),
      );
      if (!group) {
        return textResponse(
          `No group found with name "${group_name}". Active TODOs:\n${formatTodos(todos, state.groups, { currentTaskId: state.currentTaskId })}`,
        );
      }
      todos = todos.filter((t) => t.groupId === group.id);
    }
    if (tag) {
      const normalizedTag = tag.replace(/^#/, "").toLowerCase();
      todos = todos.filter((todo) => tagsForTodo(todo).includes(normalizedTag));
    }
    todos.sort((a, b) => a.sortOrder - b.sortOrder);
    if (todos.length === 0) {
      return textResponse(`No active TODOs in ${scope} scope.`);
    }
    return textResponse(
      formatTodos(todos, state.groups, { currentTaskId: state.currentTaskId }),
    );
  },
);

server.tool(
  "list_completed_todos",
  "List the user's completed TODOs/tasks stored in My Dev Notes. Optionally filter by group and project/global scope.",
  {
    scope: scopeSchema,
    group_name: z.string().optional().describe("Filter by group name"),
  },
  async ({ scope = "project", group_name }) => {
    const state = readState(scope);
    let todos = state.todos.filter((t) => t.done);
    if (group_name) {
      const group = state.groups.find(
        (g) => g.name.toLowerCase() === group_name.toLowerCase(),
      );
      if (!group) {
        return textResponse(`No group found with name "${group_name}".`, true);
      }
      todos = todos.filter((t) => t.groupId === group.id);
    }
    todos.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    if (todos.length === 0) {
      return textResponse(`No completed TODOs in ${scope} scope.`);
    }
    return textResponse(
      formatTodos(todos, state.groups, { inlineGroup: true }),
    );
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
  "Add one or more TODOs/tasks to the user's My Dev Notes task list.",
  {
    scope: scopeSchema,
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
  async ({ scope = "project", items }) => {
    const state = readState(scope);
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
        (t) => t.groupId === groupId && !t.done && !t.snoozedUntil,
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
      results.push(`Added (${scope}): "${item.text}" (${name})`);
    }
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "complete_todo",
  "Complete one or more of the user's stored TODOs/tasks. Match by id (preferred) or text.",
  {
    scope: scopeSchema,
    items: z.array(todoRef).min(1).describe("TODOs to complete"),
  },
  async ({ scope = "project", items }) => {
    const state = readState(scope);
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
      todo.snoozedUntil = undefined;
      if (scope === "project" && state.currentTaskId === todo.id) {
        state.currentTaskId = undefined;
      }
      results.push(`Completed: "${todo.text}"`);
    }
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "uncomplete_todo",
  "Restore one or more of the user's completed TODOs/tasks to active. Match by id (preferred) or text.",
  {
    scope: scopeSchema,
    items: z.array(todoRef).min(1).describe("TODOs to restore"),
  },
  async ({ scope = "project", items }) => {
    const state = readState(scope);
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
      todo.snoozedUntil = undefined;
      const todosInGroup = state.todos.filter(
        (t) =>
          t.groupId === todo.groupId &&
          !t.done &&
          !t.snoozedUntil &&
          t.id !== todo.id,
      );
      todo.sortOrder = todosInGroup.length;
      results.push(`Restored: "${todo.text}"`);
    }
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "delete_todo",
  "Permanently delete one or more of the user's stored TODOs/tasks. Match by id (preferred) or text.",
  {
    scope: scopeSchema,
    items: z.array(todoRef).min(1).describe("TODOs to delete"),
  },
  async ({ scope = "project", items }) => {
    const state = readState(scope);
    const results = [];
    for (const item of items) {
      const todo = findTodo(state.todos, item);
      if (!todo) {
        results.push(`FAIL: No TODO matching "${item.id || item.text_match}"`);
        continue;
      }
      state.todos = state.todos.filter((t) => t.id !== todo.id);
      if (scope === "project" && state.currentTaskId === todo.id) {
        state.currentTaskId = undefined;
      }
      results.push(`Deleted: "${todo.text}"`);
    }
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "edit_todo",
  "Update or edit one or more of the user's stored TODOs/tasks. Match by id (preferred) or text.",
  {
    scope: scopeSchema,
    items: z
      .array(
        todoRef.extend({
          new_text: z.string().describe("The new text for the TODO"),
        }),
      )
      .min(1)
      .describe("TODOs to edit"),
  },
  async ({ scope = "project", items }) => {
    const state = readState(scope);
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
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "move_todo",
  "Move one or more of the user's stored TODOs/tasks to a different group. Match by id (preferred) or text.",
  {
    scope: scopeSchema,
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
  async ({ scope = "project", items }) => {
    const state = readState(scope);
    const results = [];
    for (const item of items) {
      const todo = findTodo(state.todos, item);
      if (!todo) {
        results.push(`FAIL: No TODO matching "${item.id || item.text_match}"`);
        continue;
      }
      const oldGroupId = todo.groupId;
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
        (t) =>
          t.groupId === newGroupId &&
          !t.done &&
          !t.snoozedUntil &&
          t.id !== todo.id,
      );
      todo.groupId = newGroupId;
      todo.sortOrder = todosInTarget.length;
      renumberGroup(state, oldGroupId);
      results.push(`Moved: "${todo.text}" → ${targetName}`);
    }
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "snooze_todo",
  "Snooze one or more of the user's active TODOs/tasks until a timestamp or ISO date.",
  {
    scope: scopeSchema,
    until: z
      .union([z.number(), z.string()])
      .describe("Wake time as epoch milliseconds or parseable date string"),
    items: z.array(todoRef).min(1).describe("TODOs to snooze"),
  },
  async ({ scope = "project", until, items }) => {
    const timestamp =
      typeof until === "number" ? until : new Date(until).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      return textResponse(`Invalid snooze time: ${until}`, true);
    }
    const state = readState(scope);
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
      todo.snoozedUntil = timestamp;
      if (scope === "project" && state.currentTaskId === todo.id) {
        state.currentTaskId = undefined;
      }
      renumberGroup(state, todo.groupId);
      results.push(
        `Snoozed: "${todo.text}" until ${new Date(timestamp).toLocaleString()}`,
      );
    }
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "unsnooze_todo",
  "Wake one or more of the user's snoozed TODOs/tasks now. Match by id (preferred) or text.",
  {
    scope: scopeSchema,
    items: z.array(todoRef).min(1).describe("TODOs to wake"),
  },
  async ({ scope = "project", items }) => {
    const state = readState(scope);
    const results = [];
    for (const item of items) {
      const todo = findTodo(
        state.todos.filter((t) => !t.done && t.snoozedUntil),
        item,
      );
      if (!todo) {
        results.push(
          `FAIL: No snoozed TODO matching "${item.id || item.text_match}"`,
        );
        continue;
      }
      todo.snoozedUntil = undefined;
      const todosInGroup = state.todos.filter(
        (t) =>
          t.groupId === todo.groupId &&
          !t.done &&
          !t.snoozedUntil &&
          t.id !== todo.id,
      );
      todo.sortOrder = todosInGroup.length;
      results.push(`Woke: "${todo.text}"`);
    }
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "set_current_task",
  "Set or clear the user's current My Dev Notes task. Project scope only.",
  { id: z.string().nullable().describe("TODO id to pin, or null to clear") },
  async ({ id }) => {
    const state = readState("project");
    if (!id) {
      state.currentTaskId = undefined;
      writeState(state, "project");
      return textResponse("Cleared current task.");
    }
    const todo = state.todos.find(
      (t) =>
        t.id === id &&
        !t.done &&
        (!t.snoozedUntil || t.snoozedUntil <= Date.now()),
    );
    if (!todo) {
      return textResponse(
        `No active, unsnoozed project TODO found with id "${id}".`,
        true,
      );
    }
    state.currentTaskId = id;
    writeState(state, "project");
    return textResponse(`Current task: "${todo.text}"`);
  },
);

server.tool(
  "get_current_task",
  "Get the user's current My Dev Notes task for this project.",
  {},
  async () => {
    const state = readState("project");
    const todo = state.currentTaskId
      ? state.todos.find((t) => t.id === state.currentTaskId && !t.done)
      : undefined;
    if (!todo) {
      return textResponse("No current task set.");
    }
    return textResponse(`Current task: "${todo.text}" (id: ${todo.id})`);
  },
);

// ---- Group Tools ----

server.tool(
  "list_groups",
  "List the groups organizing the user's stored My Dev Notes TODOs/tasks.",
  { scope: scopeSchema },
  async ({ scope = "project" }) => {
    const state = readState(scope);
    const groups = state.groups.sort((a, b) => a.sortOrder - b.sortOrder);
    if (groups.length === 0) {
      return textResponse(
        `No groups in ${scope} scope. All TODOs are ungrouped.`,
      );
    }
    const lines = groups.map((g) => {
      const count = state.todos.filter(
        (t) => t.groupId === g.id && !t.done && !t.snoozedUntil,
      ).length;
      return `- ${g.name} (${count} active)`;
    });
    return textResponse(lines.join("\n"));
  },
);

server.tool(
  "add_group",
  "Create a group for organizing the user's stored My Dev Notes TODOs/tasks.",
  { scope: scopeSchema, name: z.string().describe("Group name") },
  async ({ scope = "project", name }) => {
    const state = readState(scope);
    const exists = state.groups.find(
      (g) => g.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      return textResponse(`Group "${name}" already exists.`, true);
    }
    state.groups.push({
      id: generateId(),
      name,
      sortOrder: state.groups.length,
      collapsed: false,
    });
    writeState(state, scope);
    return textResponse(`Created group (${scope}): "${name}"`);
  },
);

server.tool(
  "rename_group",
  "Rename a group that organizes the user's stored My Dev Notes TODOs/tasks.",
  {
    scope: scopeSchema,
    old_name: z.string().describe("Current group name"),
    new_name: z.string().describe("New group name"),
  },
  async ({ scope = "project", old_name, new_name }) => {
    const state = readState(scope);
    const group = state.groups.find(
      (g) => g.name.toLowerCase() === old_name.toLowerCase(),
    );
    if (!group) {
      return textResponse(`Group "${old_name}" not found.`, true);
    }
    const conflict = state.groups.find(
      (g) =>
        g.name.toLowerCase() === new_name.toLowerCase() && g.id !== group.id,
    );
    if (conflict) {
      return textResponse(`Group "${new_name}" already exists.`, true);
    }
    group.name = new_name;
    writeState(state, scope);
    return textResponse(`Renamed group: "${old_name}" → "${new_name}"`);
  },
);

server.tool(
  "delete_group",
  "Delete a My Dev Notes TODO/task group; its TODOs are moved to ungrouped.",
  { scope: scopeSchema, name: z.string().describe("Group name to delete") },
  async ({ scope = "project", name }) => {
    const state = readState(scope);
    const group = state.groups.find(
      (g) => g.name.toLowerCase() === name.toLowerCase(),
    );
    if (!group) {
      return textResponse(`Group "${name}" not found.`, true);
    }
    const affected = state.todos.filter((t) => t.groupId === group.id);
    for (const todo of affected) {
      todo.groupId = "";
    }
    state.groups = state.groups.filter((g) => g.id !== group.id);
    writeState(state, scope);
    const msg =
      affected.length > 0
        ? `Deleted group "${name}". ${affected.length} TODO(s) moved to ungrouped.`
        : `Deleted group "${name}".`;
    return textResponse(msg);
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
  "List the user's notes/scratch notes stored in My Dev Notes, with a preview of each note.",
  { scope: scopeSchema },
  async ({ scope = "project" }) => {
    const state = readState(scope);
    const notes = (state.notes || []).sort((a, b) => a.sortOrder - b.sortOrder);
    if (notes.length === 0) {
      return textResponse(`No notes in ${scope} scope.`);
    }
    const lines = notes.map((n) => {
      const preview =
        n.content.length > 80 ? n.content.substring(0, 80) + "..." : n.content;
      const oneLine = preview.replace(/\n/g, " ");
      return `  - ${oneLine} (id: ${n.id})`;
    });
    return textResponse(lines.join("\n"));
  },
);

server.tool(
  "add_note",
  "Add a note or temporary scratch note to the user's My Dev Notes store. Supports markdown.",
  {
    scope: scopeSchema,
    content: z.string().describe("The note content (supports markdown)"),
  },
  async ({ scope = "project", content }) => {
    const normalized = normalizeNewlines(content);
    const state = readState(scope);
    const newNote = {
      id: generateId(),
      content: normalized,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sortOrder: (state.notes || []).length,
    };
    state.notes.push(newNote);
    writeState(state, scope);
    const preview =
      content.length > 60 ? content.substring(0, 60) + "..." : content;
    return textResponse(
      `Added note (${scope}): "${preview}" (id: ${newNote.id})`,
    );
  },
);

server.tool(
  "edit_note",
  "Update or edit one or more of the user's notes stored in My Dev Notes. Match by id (preferred) or content.",
  {
    scope: scopeSchema,
    items: z
      .array(
        noteRef.extend({
          new_content: z.string().describe("The new content for the note"),
        }),
      )
      .min(1)
      .describe("Notes to edit"),
  },
  async ({ scope = "project", items }) => {
    const state = readState(scope);
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
    writeState(state, scope);
    return textResponse(results.join("\n"));
  },
);

server.tool(
  "delete_note",
  "Permanently delete one or more of the user's notes stored in My Dev Notes. Match by id (preferred) or content.",
  {
    scope: scopeSchema,
    items: z.array(noteRef).min(1).describe("Notes to delete"),
  },
  async ({ scope = "project", items }) => {
    const state = readState(scope);
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
    writeState(state, scope);
    return textResponse(results.join("\n"));
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
