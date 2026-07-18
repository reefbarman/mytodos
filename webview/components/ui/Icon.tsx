export type IconName =
  | "add"
  | "bold"
  | "check"
  | "checklist"
  | "chevron-down"
  | "chevron-right"
  | "clock"
  | "close"
  | "code"
  | "copy"
  | "edit"
  | "folder"
  | "italic"
  | "link"
  | "list-ordered"
  | "list-unordered"
  | "more"
  | "note"
  | "pin"
  | "quote"
  | "refresh"
  | "search"
  | "trash";

const codiconNames: Record<IconName, string> = {
  add: "add",
  bold: "bold",
  check: "check",
  checklist: "checklist",
  "chevron-down": "chevron-down",
  "chevron-right": "chevron-right",
  clock: "clock",
  close: "close",
  code: "code",
  copy: "copy",
  edit: "edit",
  folder: "folder",
  italic: "italic",
  link: "link",
  "list-ordered": "list-ordered",
  "list-unordered": "list-unordered",
  more: "ellipsis",
  note: "note",
  pin: "pin",
  quote: "quote",
  refresh: "refresh",
  search: "search",
  trash: "trash",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className = "" }: IconProps) {
  return (
    <span
      class={`codicon codicon-${codiconNames[name]} ui-icon ${className}`}
      style={{ fontSize: `${size}px` }}
      aria-hidden="true"
    />
  );
}
