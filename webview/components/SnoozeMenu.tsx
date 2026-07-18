import { useEffect, useRef, useState } from "preact/hooks";

import { Icon } from "./ui/Icon";
import { IconButton } from "./ui/IconButton";

interface SnoozeMenuProps {
  onSnooze: (until: number) => void;
}

function tomorrowAt(hour: number): number {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

function nextMondayAt(hour: number): number {
  const date = new Date();
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

function localDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function defaultCustomValue(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return localDateTimeValue(date);
}

export function SnoozeMenu({ onSnooze }: SnoozeMenuProps) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState(defaultCustomValue);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (until: number) => {
    if (until > Date.now()) onSnooze(until);
    setOpen(false);
    setCustomOpen(false);
  };

  return (
    <div ref={rootRef} class="ui-menu snooze-menu">
      <IconButton
        icon="clock"
        label="Snooze task"
        active={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      />
      {open && (
        <div
          class="ui-menu-popover align-end snooze-popover"
          role="dialog"
          aria-label="Snooze task"
        >
          <button
            class="ui-menu-item"
            onClick={() => choose(Date.now() + 4 * 60 * 60 * 1000)}
          >
            <Icon name="clock" />
            <span>Later today</span>
            <small>+4h</small>
          </button>
          <button class="ui-menu-item" onClick={() => choose(tomorrowAt(9))}>
            <Icon name="clock" />
            <span>Tomorrow</span>
            <small>9am</small>
          </button>
          <button class="ui-menu-item" onClick={() => choose(nextMondayAt(9))}>
            <Icon name="clock" />
            <span>Next week</span>
            <small>Mon 9am</small>
          </button>
          <button
            class="ui-menu-item"
            onClick={() => setCustomOpen(!customOpen)}
          >
            <Icon name="clock" />
            <span>Custom</span>
            <Icon
              name={customOpen ? "chevron-down" : "chevron-right"}
              size={12}
            />
          </button>
          {customOpen && (
            <div class="snooze-custom">
              <input
                type="datetime-local"
                aria-label="Custom snooze time"
                value={customValue}
                min={localDateTimeValue(new Date())}
                onInput={(event) =>
                  setCustomValue((event.target as HTMLInputElement).value)
                }
              />
              <button
                type="button"
                class="snooze-custom-submit"
                onClick={() => choose(new Date(customValue).getTime())}
              >
                Snooze
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
