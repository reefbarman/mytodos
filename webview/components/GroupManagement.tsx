import { useState, useRef } from 'preact/hooks';

interface GroupManagementProps {
  onAddGroup: (name: string) => void;
}

export function GroupManagement({ onAddGroup }: GroupManagementProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddGroup(trimmed);
    setName('');
  };

  return (
    <div id="group-management">
      <input
        ref={inputRef}
        type="text"
        placeholder="New group name..."
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <button id="add-group-btn" onClick={submit}>+ Group</button>
    </div>
  );
}
