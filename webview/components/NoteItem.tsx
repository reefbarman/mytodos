import type { NoteItem as NoteItemType } from "../types";
import { useState } from "preact/hooks";

import { stripMarkdownImages } from "../markdown";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownEditor } from "./MarkdownEditor";
import { ActionMenu, type ActionMenuItem } from "./ui/ActionMenu";

interface NoteItemProps {
  note: NoteItemType;
  startInEditMode?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}

export function NoteItem({
  note,
  startInEditMode,
  onEdit,
  onDelete,
}: NoteItemProps) {
  const [editing, setEditing] = useState(!!startInEditMode);
  const [editContent, setEditContent] = useState(note.content);
  const [copied, setCopied] = useState(false);

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
      label: copied ? "Copied" : "Copy text",
      icon: copied ? "check" : "copy",
      onSelect: () => void copyText(),
    },
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
      <MarkdownContent
        content={note.content}
        className="note-content"
        onDblClick={startEdit}
      />
      <div class="item-actions note-actions">
        <ActionMenu items={menuItems} label="Note actions" />
      </div>
    </article>
  );
}
