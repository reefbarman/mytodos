import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

import { Icon, type IconName } from "./ui/Icon";

interface DisclosureSectionProps {
  title: string;
  count: number;
  icon: IconName;
  children: ComponentChildren;
  className?: string;
  defaultOpen?: boolean;
}

export function DisclosureSection({
  title,
  count,
  icon,
  children,
  className = "",
  defaultOpen = false,
}: DisclosureSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section class={`disclosure-section ${className}`}>
      <button
        type="button"
        class="disclosure-header"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
        <Icon name={icon} size={14} className="disclosure-icon" />
        <span>{title}</span>
        <span class="section-count">{count}</span>
      </button>
      {open && <div class="disclosure-content">{children}</div>}
    </section>
  );
}
