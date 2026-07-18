import type { ComponentChildren } from "preact";

import { Icon, type IconName } from "./Icon";

interface QuickActionProps {
  label: string;
  onClick: () => void;
  icon?: IconName;
  className?: string;
  trailing?: ComponentChildren;
}

export function QuickAction({
  label,
  onClick,
  icon = "add",
  className = "",
  trailing,
}: QuickActionProps) {
  return (
    <button type="button" class={`quick-action ${className}`} onClick={onClick}>
      <Icon name={icon} size={14} />
      <span>{label}</span>
      {trailing && <span class="quick-action-trailing">{trailing}</span>}
    </button>
  );
}
