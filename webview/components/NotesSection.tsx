import { useState } from 'preact/hooks';
import type { NoteItem as NoteItemType } from '../types';
import { SectionHeader } from './SectionHeader';
import { NoteItem } from './NoteItem';

interface NotesSectionProps {
  notes: NoteItemType[];
  onAdd: (content: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}

export function NotesSection({ notes, onAdd, onEdit, onDelete }: NotesSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  const handleAddNote = () => {
    // Create a note with empty content — it will start in edit mode
    onAdd('');
    // We need to track the newest note to start it in edit mode.
    // We'll set a flag and the next render will have the new note.
    setNewNoteId('pending');
  };

  // Detect if a new note was just added
  const sorted = [...notes].sort((a, b) => a.sortOrder - b.sortOrder);
  let latestNoteId: string | null = null;
  if (newNoteId === 'pending' && sorted.length > 0) {
    latestNoteId = sorted[sorted.length - 1].id;
    // Clear after one render cycle
    setTimeout(() => setNewNoteId(null), 0);
  }

  return (
    <div class="group-section notes-section">
      <SectionHeader
        title="Notes"
        count={notes.length}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      {!collapsed && (
        <div class="notes-list">
          {sorted.map(note => (
            <NoteItem
              key={note.id}
              note={note}
              startInEditMode={note.id === latestNoteId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          <button class="inline-add-btn" onClick={handleAddNote}>+ Add Note</button>
        </div>
      )}
    </div>
  );
}
