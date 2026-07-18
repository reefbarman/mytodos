import { ComponentChildren } from "preact";

interface SectionHeaderProps {
  title: string;
  titleContent?: ComponentChildren;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  draggable?: boolean;
  actions?: ComponentChildren;
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
  onDragStart,
  onDragEnd,
}: SectionHeaderProps) {
  return (
    <div
      class="group-header"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span
        class="collapse-toggle"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {collapsed ? "\u25B6" : "\u25BC"}
      </span>
      <span class="group-name">{titleContent ?? title}</span>
      <span class="group-count">({count})</span>
      {actions}
    </div>
  );
}
