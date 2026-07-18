import type { ComponentChildren } from "preact";
import { Icon } from "./ui/Icon";

interface SectionHeaderProps {
  title: string;
  titleContent?: ComponentChildren;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  draggable?: boolean;
  actions?: ComponentChildren;
  icon?: "folder" | "note";
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
}

export function SectionHeader({
  title,
  titleContent,
  count,
  collapsed,
  onToggle,
  draggable,
  actions,
  icon,
  onDragStart,
  onDragEnd,
}: SectionHeaderProps) {
  return (
    <div
      class="section-header"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        class="section-toggle"
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
        aria-expanded={!collapsed}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={14} />
      </button>
      {icon && <Icon name={icon} className="section-icon" />}
      <div class="section-title">{titleContent ?? title}</div>
      <span class="section-count" aria-label={`${count} items`}>
        {count}
      </span>
      {actions && <div class="section-actions">{actions}</div>}
    </div>
  );
}
