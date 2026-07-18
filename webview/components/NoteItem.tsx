import { MarkdownContent } from "./MarkdownContent";
import { MarkdownEditor } from "./MarkdownEditor";
import type { NoteItem as NoteItemType } from "../types";
import { stripMarkdownImages } from "../markdown";
import { useState } from "preact/hooks";

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

  const startEdit = () => {
    setEditContent(note.content);
    setEditing(true);
  };

  const commitEdit = () => {
    const content = editContent.trim();
    if (content && content !== note.content) {
      onEdit(note.id, content);
    } else if (!content) {
      // Empty note — delete it
      onDelete(note.id);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    if (!note.content) {
      // New note with no content — delete
      onDelete(note.id);
    }
    setEditing(false);
  };

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard.writeText(stripMarkdownImages(note.content));
    btn.innerHTML = "&#10003;";
    setTimeout(() => {
      btn.innerHTML = "&#128203;";
    }, 1200);
  };

  if (editing) {
    return (
      <div class="note-item note-editing">
        <MarkdownEditor
          value={editContent}
          onChange={setEditContent}
          onCommit={commitEdit}
          onCancel={cancelEdit}
          placeholder="Write markdown here... Paste or drop screenshots/images."
          autoFocus
          commitLabel="Save note"
        />
      </div>
    );
  }

  return (
    <div class="note-item">
      <MarkdownContent
        content={note.content}
        className="note-content"
        onDblClick={startEdit}
      />
      <div class="note-actions">
        <button
          class="note-action-btn"
          title="Edit"
          onClick={startEdit}
          dangerouslySetInnerHTML={{ __html: "&#9998;" }}
        />
        <button
          class="note-action-btn note-copy-btn"
          title="Copy text without images"
          onClick={handleCopy}
          dangerouslySetInnerHTML={{ __html: "&#128203;" }}
        />
        <button
          class="note-action-btn note-delete-btn"
          title="Delete"
          onClick={() => onDelete(note.id)}
          dangerouslySetInnerHTML={{ __html: "&times;" }}
        />
      </div>
    </div>
  );
}
