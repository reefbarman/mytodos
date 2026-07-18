import { useEffect, useMemo, useRef } from "preact/hooks";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  commitLabel?: string;
  compact?: boolean;
}

const MAX_IMAGE_BYTES = 1_500_000;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageAltText(file: File, index: number): string {
  const name = file.name?.replace(/\.[^.]+$/, "").trim();
  return name || `image-${index + 1}`;
}

function isImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

const DATA_IMAGE_MARKDOWN_RE =
  /!\[([^\]]*)\]\((data:image\/(?:png|jpeg|gif|webp|bmp);base64,[^)]+)\)/gi;
const ATTACHMENT_MARKDOWN_RE = /!\[([^\]]*)\]\(attachment:([^)]+)\)/g;

export function MarkdownEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder = "Write markdown... Paste or drop screenshots/images here.",
  className = "",
  autoFocus,
  commitLabel = "Save",
  compact,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentsRef = useRef(new Map<string, string>());
  const attachmentIdsByDataUrlRef = useRef(new Map<string, string>());
  const nextAttachmentIdRef = useRef(1);

  const getAttachmentId = (dataUrl: string) => {
    const existing = attachmentIdsByDataUrlRef.current.get(dataUrl);
    if (existing) return existing;

    const id = `img-${nextAttachmentIdRef.current++}`;
    attachmentsRef.current.set(id, dataUrl);
    attachmentIdsByDataUrlRef.current.set(dataUrl, id);
    return id;
  };

  const toEditorValue = (source: string) =>
    source.replace(
      DATA_IMAGE_MARKDOWN_RE,
      (_match, alt: string, dataUrl: string) => {
        const id = getAttachmentId(dataUrl);
        return `![${alt}](attachment:${id})`;
      },
    );

  const toStoredValue = (source: string) =>
    source.replace(ATTACHMENT_MARKDOWN_RE, (match, alt: string, id: string) => {
      const dataUrl = attachmentsRef.current.get(id);
      return dataUrl ? `![${alt}](${dataUrl})` : match;
    });

  const editorValue = useMemo(() => toEditorValue(value), [value]);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(compact ? 52 : 80, el.scrollHeight)}px`;
  };

  useEffect(() => {
    resize();
  }, [editorValue]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(editorValue.length, editorValue.length);
    resize();
  }, [autoFocus]);

  const updateValue = (
    next: string,
    selectionStart?: number,
    selectionEnd = selectionStart,
  ) => {
    onChange(toStoredValue(next));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el || selectionStart === undefined) return;
      el.focus();
      el.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
      resize();
    });
  };

  const insertText = (text: string, cursorOffset = text.length) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = editorValue.slice(0, start) + text + editorValue.slice(end);
    updateValue(next, start + cursorOffset);
  };

  const wrapSelection = (before: string, after = before, fallback = "text") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = editorValue.slice(start, end) || fallback;
    const replacement = `${before}${selected}${after}`;
    const next =
      editorValue.slice(0, start) + replacement + editorValue.slice(end);
    updateValue(
      next,
      start + before.length,
      start + before.length + selected.length,
    );
  };

  const transformSelectedLines = (
    transform: (line: string, index: number) => string,
  ) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = editorValue.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = editorValue.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? editorValue.length : lineEndIndex;
    const block = editorValue.slice(lineStart, lineEnd);
    const replacement = block.split("\n").map(transform).join("\n");
    const next =
      editorValue.slice(0, lineStart) +
      replacement +
      editorValue.slice(lineEnd);
    updateValue(next, lineStart, lineStart + replacement.length);
  };

  const insertImages = async (files: FileList | File[]) => {
    const images = Array.from(files).filter(
      (file) => isImageFile(file) && file.size <= MAX_IMAGE_BYTES,
    );
    if (images.length === 0) return false;

    const snippets = await Promise.all(
      images.map(async (file, index) => {
        const dataUrl = await readFileAsDataUrl(file);
        const id = getAttachmentId(dataUrl);
        return `![${imageAltText(file, index)}](attachment:${id})`;
      }),
    );

    insertText(`${snippets.join("\n\n")}\n`, snippets.join("\n\n").length + 1);
    return true;
  };

  const toolbarButton = (label: string, title: string, onClick: () => void) => (
    <button
      type="button"
      class="markdown-toolbar-btn"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div
      class={`markdown-editor ${compact ? "markdown-editor-compact" : ""} ${className}`}
    >
      <div class="markdown-toolbar" aria-label="Markdown formatting toolbar">
        {toolbarButton("B", "Bold", () =>
          wrapSelection("**", "**", "bold text"),
        )}
        {toolbarButton("I", "Italic", () =>
          wrapSelection("*", "*", "italic text"),
        )}
        {toolbarButton("•", "Bulleted list", () =>
          transformSelectedLines((line) =>
            line.trim() ? `- ${line.replace(/^[-*]\s+/, "")}` : "- ",
          ),
        )}
        {toolbarButton("1.", "Numbered list", () =>
          transformSelectedLines((line, index) =>
            line.trim()
              ? `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`
              : `${index + 1}. `,
          ),
        )}
        {toolbarButton("☑", "Checklist", () =>
          transformSelectedLines((line) =>
            line.trim()
              ? `- [ ] ${line.replace(/^- \[[ xX]\]\s+/, "")}`
              : "- [ ] ",
          ),
        )}
        {toolbarButton("❝", "Quote", () =>
          transformSelectedLines((line) =>
            line.trim() ? `> ${line.replace(/^>\s?/, "")}` : "> ",
          ),
        )}
        {toolbarButton("{}", "Code", () => wrapSelection("`", "`", "code"))}
        {toolbarButton("[]", "Link", () =>
          wrapSelection("[", "](https://)", "link text"),
        )}
      </div>
      <textarea
        ref={textareaRef}
        class="markdown-editor-textarea"
        value={editorValue}
        placeholder={placeholder}
        onInput={(e) => {
          onChange(toStoredValue((e.target as HTMLTextAreaElement).value));
          resize();
        }}
        onPaste={async (e) => {
          const files = e.clipboardData?.files;
          if (!files || files.length === 0) return;
          const imageFiles = Array.from(files).filter(isImageFile);
          if (imageFiles.length === 0) return;
          e.preventDefault();
          await insertImages(imageFiles);
        }}
        onDrop={async (e) => {
          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;
          const imageFiles = Array.from(files).filter(isImageFile);
          if (imageFiles.length === 0) return;
          e.preventDefault();
          await insertImages(imageFiles);
        }}
        onDragOver={(e) => {
          if (
            Array.from(e.dataTransfer?.items || []).some((item) =>
              item.type.startsWith("image/"),
            )
          ) {
            e.preventDefault();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onCommit();
          }
        }}
      />
      <div class="markdown-editor-footer">
        <span class="markdown-editor-hint">
          Markdown supported · images shown as attachment placeholders ·
          ⌘/Ctrl+Enter saves
        </span>
        <div class="markdown-editor-actions">
          <button
            type="button"
            class="markdown-editor-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            class="markdown-editor-primary"
            onClick={onCommit}
          >
            {commitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
