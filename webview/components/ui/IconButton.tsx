import type { ComponentChildren, JSX } from "preact";

import { Icon, type IconName } from "./Icon";

interface IconButtonProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "icon"
> {
  icon: IconName;
  label: string;
  active?: boolean;
  danger?: boolean;
  children?: ComponentChildren;
}

export function IconButton({
  icon,
  label,
  active,
  danger,
  class: className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      class={`ui-icon-button${active ? " is-active" : ""}${danger ? " is-danger" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}
