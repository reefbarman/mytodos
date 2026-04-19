import { useState, useRef } from "preact/hooks";

interface InlineAddInputProps {
  groupId: string;
  onAdd: (text: string, groupId: string) => void;
  label?: string;
}

export function InlineAddInput({
  groupId,
  onAdd,
  label = "+ Add TODO",
}: InlineAddInputProps) {
  const [showInput, setShowInput] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const committedRef = useRef(false);

  const openInput = () => {
    setShowInput(true);
    setText("");
    committedRef.current = false;
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = text.trim();
    if (trimmed) {
      onAdd(trimmed, groupId);
    }
    setShowInput(false);
    setText("");
  };

  const cancel = () => {
    committedRef.current = true;
    setShowInput(false);
    setText("");
  };

  if (showInput) {
    return (
      <textarea
        ref={inputRef}
        class="todo-add-inline"
        placeholder="Add a TODO..."
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
            return;
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
      />
    );
  }

  return (
    <button class="inline-add-btn" onClick={openInput}>
      {label}
    </button>
  );
}
