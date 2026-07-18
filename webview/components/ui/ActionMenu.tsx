import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";

export interface ActionMenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  detail?: string;
  danger?: boolean;
  checked?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
  icon?: IconName;
  align?: "start" | "end";
  className?: string;
  children?: ComponentChildren;
}

export function ActionMenu({
  items,
  label = "More actions",
  icon = "more",
  align = "end",
  className = "",
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} class={`ui-menu ${className}`}>
      <IconButton
        icon={icon}
        label={label}
        active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      />
      {open && (
        <div class={`ui-menu-popover align-${align}`} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              class={`ui-menu-item${item.danger ? " is-danger" : ""}`}
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              <Icon name={item.checked ? "check" : item.icon} />
              <span>{item.label}</span>
              {item.detail && <small>{item.detail}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
