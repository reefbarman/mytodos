import { useEffect, useRef, useState } from "preact/hooks";

import { IconButton } from "./ui/IconButton";
import { QuickAction } from "./ui/QuickAction";

interface GroupManagementProps {
  onAddGroup: (name: string) => void;
}

export function GroupManagement({ onAddGroup }: GroupManagementProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setName("");
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddGroup(trimmed);
    close();
  };

  if (!open) {
    return (
      <QuickAction
        label="New group"
        icon="folder"
        className="group-quick-action"
        onClick={() => setOpen(true)}
      />
    );
  }

  return (
    <div class="quick-input-row group-quick-input">
      <input
        ref={inputRef}
        type="text"
        aria-label="Group name"
        placeholder="Group name"
        value={name}
        onInput={(event) => setName((event.target as HTMLInputElement).value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          if (event.key === "Escape") close();
        }}
      />
      <IconButton icon="check" label="Create group" onClick={submit} />
      <IconButton icon="close" label="Cancel" onClick={close} />
    </div>
  );
}
