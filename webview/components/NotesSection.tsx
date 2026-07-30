import { NoteItem } from "./NoteItem";
import type { NoteItem as NoteItemType } from "../types";
import { QuickAction } from "./ui/QuickAction";
import { SectionHeader } from "./SectionHeader";
import { useState } from "preact/hooks";

interface NotesSectionProps {
  notes: NoteItemType[];
  createdNoteIds: string[];
  onAdd: (content: string) => void;
  onCreatedNoteOpened: (id: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}

export function NotesSection({
  notes,
  createdNoteIds,
  onAdd,
  onCreatedNoteOpened,
  onEdit,
  onDelete,
}: NotesSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const sorted = [...notes].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section class="workspace-section notes-section">
      <SectionHeader
        title="Notes"
        icon="note"
        count={notes.length}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      {!collapsed && (
        <div class="section-content notes-list">
          {sorted.length === 0 && (
            <div class="section-empty">
              Capture temporary context and references.
            </div>
          )}
          {sorted.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              openEditor={createdNoteIds.includes(note.id)}
              onEditorOpened={onCreatedNoteOpened}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          <QuickAction label="New note" icon="note" onClick={() => onAdd("")} />
        </div>
      )}
    </section>
  );
}
