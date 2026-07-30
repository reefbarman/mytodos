import type { NoteItem as NoteItemType } from "../types";
import { useEffect, useState } from "preact/hooks";

import { stripMarkdownImages } from "../markdown";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownEditor } from "./MarkdownEditor";
import { ActionMenu, type ActionMenuItem } from "./ui/ActionMenu";
import { IconButton } from "./ui/IconButton";

interface NoteItemProps {
  note: NoteItemType;
  openEditor?: boolean;
  onEditorOpened?: (id: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}

export function NoteItem({
  note,
  openEditor,
  onEditorOpened,
  onEdit,
  onDelete,
}: NoteItemProps) {
  const [editing, setEditing] = useState(!!openEditor);
  const [editContent, setEditContent] = useState(note.content);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!openEditor) return;
    if (!editing) {
      setEditContent(note.content);
      setEditing(true);
    }
    onEditorOpened?.(note.id);
  }, [openEditor, note.id]);

  const startEdit = () => {
    setEditContent(note.content);
    setEditing(true);
  };

  const commitEdit = () => {
    const content = editContent.trim();
    if (content && content !== note.content) {
      onEdit(note.id, content);
    } else if (!content) {
      onDelete(note.id);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    if (!note.content) onDelete(note.id);
    setEditing(false);
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(stripMarkdownImages(note.content));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const menuItems: ActionMenuItem[] = [
    { label: "Edit", icon: "edit", onSelect: startEdit },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      onSelect: () => onDelete(note.id),
    },
  ];

  if (editing) {
    return (
      <article class="note-item note-editing">
        <MarkdownEditor
          value={editContent}
          onChange={setEditContent}
          onCommit={commitEdit}
          onCancel={cancelEdit}
          placeholder="Write a note…"
          autoFocus
          commitLabel="Save"
        />
      </article>
    );
  }

  return (
    <article class="note-item">
      {note.content.trim() ? (
        <MarkdownContent
          content={note.content}
          className="note-content"
          onDblClick={startEdit}
        />
      ) : (
        <div
          class="markdown-content note-content"
          style={{ color: "var(--mdn-muted)" }}
          onDblClick={startEdit}
        >
          Double-click to edit
        </div>
      )}
      <div class="item-actions note-actions">
        <ActionMenu items={menuItems} label="Note actions" />
        <IconButton
          icon={copied ? "check" : "copy"}
          label={copied ? "Note text copied" : "Copy note text without images"}
          class="primary-copy-action"
          onClick={() => void copyText()}
        />
      </div>
    </article>
  );
}
