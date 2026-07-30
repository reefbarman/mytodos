const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

const PNG_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const GIF_DATA = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function imageMarkdown(alt, mimeType, data) {
  return `![${alt}](data:${mimeType};base64,${data})`;
}

function resultText(result) {
  return result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n");
}

function resultImages(result) {
  return result.content.filter((content) => content.type === "image");
}

function assertImage(image, expected) {
  assert.deepEqual(image, {
    type: "image",
    data: expected.data,
    mimeType: expected.mimeType,
    _meta: {
      "mydevnotes/attachmentId": expected.attachmentId,
      "mydevnotes/sourceType": expected.sourceType,
      "mydevnotes/sourceId": expected.sourceId,
      ...(expected.alt ? { "mydevnotes/alt": expected.alt } : {}),
    },
  });
}

test("MCP read tools return images and edits preserve attachment placeholders", async (t) => {
  const tempRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mydevnotes-mcp-test-")),
  );
  const tempHome = path.join(tempRoot, "home");
  const workspace = path.join(tempRoot, "workspace");
  const dataDir = path.join(tempHome, ".mydevnotes");
  const dataFile = path.join(dataDir, "data.json");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });

  const activeTodo = {
    id: "todo-active",
    text: `Fix layout\n${imageMarkdown("layout", "image/png", PNG_DATA)}\n${imageMarkdown("animation", "image/gif", GIF_DATA)}`,
    done: false,
    createdAt: 1,
    groupId: "",
    sortOrder: 0,
  };
  const secondTodo = {
    id: "todo-second",
    text: `Check empty alt ${imageMarkdown("", "image/png", PNG_DATA)}`,
    done: false,
    createdAt: 2,
    groupId: "",
    sortOrder: 1,
  };
  const invalidTodo = {
    id: "todo-invalid",
    text: "Corrupt ![broken](data:image/png;base64,A)",
    done: false,
    createdAt: 3,
    groupId: "",
    sortOrder: 2,
  };
  const completedTodo = {
    id: "todo-completed",
    text: `Verify animation ${imageMarkdown("animation", "image/gif", GIF_DATA)}`,
    done: true,
    createdAt: 4,
    completedAt: 5,
    groupId: "",
    sortOrder: 3,
  };
  const note = {
    id: "note-1",
    content: `${"Long reference text ".repeat(8)}${imageMarkdown("reference", "image/png", PNG_DATA)} ${imageMarkdown("demo", "image/gif", GIF_DATA)}`,
    createdAt: 1,
    updatedAt: 1,
    sortOrder: 0,
  };
  const secondNote = {
    id: "note-2",
    content: `Second reference ${imageMarkdown("other", "image/png", PNG_DATA)}`,
    createdAt: 2,
    updatedAt: 2,
    sortOrder: 1,
  };
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      [workspace]: {
        todos: [activeTodo, secondTodo, invalidTodo, completedTodo],
        groups: [],
        notes: [note, secondNote],
        currentTaskId: activeTodo.id,
        schemaVersion: 3,
      },
    }),
  );

  const client = new Client({ name: "mydevnotes-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(__dirname, "..", "mcp-server.js")],
    cwd: workspace,
    env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
    stderr: "inherit",
  });
  t.after(async () => {
    await client.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  await client.connect(transport);

  const activeResult = await client.callTool({
    name: "list_todos",
    arguments: { scope: "project", include_snoozed: true },
  });
  const activeText = resultText(activeResult);
  const activeImages = resultImages(activeResult);
  assert.match(activeText, /!\[layout\]\(attachment:img-1\)/);
  assert.match(activeText, /!\[animation\]\(attachment:img-2\)/);
  assert.match(activeText, /!\[]\(attachment:img-1\)/);
  assert.match(activeText, /\[invalid embedded image: broken\]/);
  assert.doesNotMatch(activeText, /data:image\//);
  assert.equal(activeImages.length, 3);
  assertImage(activeImages[0], {
    attachmentId: "img-1",
    data: PNG_DATA,
    mimeType: "image/png",
    sourceType: "todo",
    sourceId: activeTodo.id,
    alt: "layout",
  });
  assertImage(activeImages[1], {
    attachmentId: "img-2",
    data: GIF_DATA,
    mimeType: "image/gif",
    sourceType: "todo",
    sourceId: activeTodo.id,
    alt: "animation",
  });
  assertImage(activeImages[2], {
    attachmentId: "img-1",
    data: PNG_DATA,
    mimeType: "image/png",
    sourceType: "todo",
    sourceId: secondTodo.id,
    alt: "",
  });

  const completedResult = await client.callTool({
    name: "list_completed_todos",
    arguments: { scope: "project" },
  });
  assert.match(
    resultText(completedResult),
    /Verify animation !\[animation\]\(attachment:img-1\)/,
  );
  assertImage(resultImages(completedResult)[0], {
    attachmentId: "img-1",
    data: GIF_DATA,
    mimeType: "image/gif",
    sourceType: "todo",
    sourceId: completedTodo.id,
    alt: "animation",
  });

  const currentResult = await client.callTool({
    name: "get_current_task",
    arguments: {},
  });
  assert.match(
    resultText(currentResult),
    /Current task: "Fix layout\n!\[layout\]\(attachment:img-1\)\n!\[animation\]\(attachment:img-2\)"/,
  );
  assert.equal(resultImages(currentResult).length, 2);

  const notesResult = await client.callTool({
    name: "list_notes",
    arguments: { scope: "project" },
  });
  const notesText = resultText(notesResult);
  const noteImages = resultImages(notesResult);
  assert.match(notesText, /\[attachments: img-1, img-2\].*\(id: note-1\)/);
  assert.match(notesText, /\[attachments: img-1\].*\(id: note-2\)/);
  assert.equal(noteImages.length, 3);
  assertImage(noteImages[0], {
    attachmentId: "img-1",
    data: PNG_DATA,
    mimeType: "image/png",
    sourceType: "note",
    sourceId: note.id,
    alt: "reference",
  });
  assertImage(noteImages[2], {
    attachmentId: "img-1",
    data: PNG_DATA,
    mimeType: "image/png",
    sourceType: "note",
    sourceId: secondNote.id,
    alt: "other",
  });

  const editTodoResult = await client.callTool({
    name: "edit_todo",
    arguments: {
      scope: "project",
      items: [
        {
          id: activeTodo.id,
          new_text:
            "Fix responsive layout\n![layout](attachment:img-1)\n![animation](attachment:img-2)",
        },
      ],
    },
  });
  assert.equal(resultImages(editTodoResult).length, 0);

  const editNoteResult = await client.callTool({
    name: "edit_note",
    arguments: {
      scope: "project",
      items: [
        {
          id: note.id,
          new_content:
            "Updated reference\n![reference](attachment:img-1)\n![demo](attachment:img-2)",
        },
      ],
    },
  });
  assert.equal(resultImages(editNoteResult).length, 0);

  const storedState = JSON.parse(fs.readFileSync(dataFile, "utf-8"))[workspace];
  const storedTodo = storedState.todos.find(
    (todo) => todo.id === activeTodo.id,
  );
  const storedNote = storedState.notes.find((item) => item.id === note.id);
  assert.equal(
    storedTodo.text,
    `Fix responsive layout\n${imageMarkdown("layout", "image/png", PNG_DATA)}\n${imageMarkdown("animation", "image/gif", GIF_DATA)}`,
  );
  assert.equal(
    storedNote.content,
    `Updated reference\n${imageMarkdown("reference", "image/png", PNG_DATA)}\n${imageMarkdown("demo", "image/gif", GIF_DATA)}`,
  );
});
