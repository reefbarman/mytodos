import { NoteItem } from "./NoteItem";
import type { NoteItem as NoteItemType } from "../types";
import { QuickAction } from "./ui/QuickAction";
import { SectionHeader } from "./SectionHeader";
import { useState } from "preact/hooks";

interface NotesSectionProps {
  notes: NoteItemType[];
  onAdd: (content: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
}

export function NotesSection({
  notes,
  onAdd,
  onEdit,
  onDelete,
}: NotesSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  const handleAddNote = () => {
    onAdd("");
    setNewNoteId("pending");
  };

  const sorted = [...notes].sort((a, b) => a.sortOrder - b.sortOrder);
  let latestNoteId: string | null = null;
  if (newNoteId === "pending" && sorted.length > 0) {
    latestNoteId = sorted[sorted.length - 1].id;
    setTimeout(() => setNewNoteId(null), 0);
  }

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
              startInEditMode={note.id === latestNoteId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          <QuickAction label="New note" icon="note" onClick={handleAddNote} />
        </div>
      )}
    </section>
  );
}
