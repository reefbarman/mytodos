import { MarkdownEditor } from "./MarkdownEditor";
import { useState } from "preact/hooks";

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

  const openInput = () => {
    setShowInput(true);
    setText("");
  };

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onAdd(trimmed, groupId);
    }
    setShowInput(false);
    setText("");
  };

  const cancel = () => {
    setShowInput(false);
    setText("");
  };

  if (showInput) {
    return (
      <MarkdownEditor
        value={text}
        onChange={setText}
        onCommit={commit}
        onCancel={cancel}
        placeholder="Add a TODO... Paste/drop screenshots or use Markdown."
        className="todo-add-inline"
        autoFocus
        commitLabel="Add"
        compact
      />
    );
  }

  return (
    <button class="inline-add-btn" onClick={openInput}>
      {label}
    </button>
  );
}
