import { useState, useRef, useEffect } from 'preact/hooks';
import { marked } from 'marked';
import type { NoteItem as NoteItemType } from '../types';

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

interface NoteItemProps {
  note: NoteItemType;
  startInEditMode?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}

export function NoteItem({ note, startInEditMode, onEdit, onDelete }: NoteItemProps) {
  const [editing, setEditing] = useState(!!startInEditMode);
  const [editContent, setEditContent] = useState(note.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize(textareaRef.current);
    }
  }, [editing]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.max(60, el.scrollHeight) + 'px';
  };

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
    navigator.clipboard.writeText(note.content);
    btn.innerHTML = '&#10003;';
    setTimeout(() => { btn.innerHTML = '&#128203;'; }, 1200);
  };

  if (editing) {
    return (
      <div class="note-item note-editing">
        <textarea
          ref={textareaRef}
          class="note-edit-textarea"
          value={editContent}
          placeholder="Write markdown here..."
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            setEditContent(el.value);
            autoResize(el);
          }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') cancelEdit();
          }}
        />
      </div>
    );
  }

  const html = marked.parse(note.content) as string;

  return (
    <div class="note-item">
      <div
        class="note-content markdown-content"
        dangerouslySetInnerHTML={{ __html: html }}
        onDblClick={startEdit}
      />
      <div class="note-actions">
        <button class="note-action-btn" title="Edit" onClick={startEdit} dangerouslySetInnerHTML={{ __html: '&#9998;' }} />
        <button class="note-action-btn note-copy-btn" title="Copy markdown" onClick={handleCopy} dangerouslySetInnerHTML={{ __html: '&#128203;' }} />
        <button class="note-action-btn note-delete-btn" title="Delete" onClick={() => onDelete(note.id)} dangerouslySetInnerHTML={{ __html: '&times;' }} />
      </div>
    </div>
  );
}
