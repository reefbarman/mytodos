import { Icon } from "./ui/Icon";
import { IconButton } from "./ui/IconButton";
import type { RefObject } from "preact";
import type { Scope } from "../types";

interface WorkspaceToolbarProps {
  scope: Scope;
  filter: string;
  tags: Array<[string, number]>;
  searchRef: RefObject<HTMLInputElement>;
  onScopeChange: (scope: Scope) => void;
  onFilterChange: (filter: string) => void;
}

export function WorkspaceToolbar({
  scope,
  filter,
  tags,
  searchRef,
  onScopeChange,
  onFilterChange,
}: WorkspaceToolbarProps) {
  return (
    <header class="workspace-toolbar">
      <div class="scope-switcher" role="tablist" aria-label="Notes scope">
        {(["project", "global"] as Scope[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={option === scope}
            class={option === scope ? "is-active" : ""}
            onClick={() => onScopeChange(option)}
          >
            {option === "project" ? "Project" : "Global"}
          </button>
        ))}
      </div>

      <div class="search-box">
        <Icon name="search" size={14} />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search tasks and notes"
          placeholder="Search tasks and notes"
          value={filter}
          onInput={(event) =>
            onFilterChange((event.target as HTMLInputElement).value)
          }
        />
        {filter && (
          <IconButton
            icon="close"
            label="Clear search"
            onClick={() => onFilterChange("")}
          />
        )}
      </div>

      {tags.length > 0 && (
        <div class="tag-filters" aria-label="Filter by tag">
          {tags.map(([tag, count]) => {
            const selected = filter.toLowerCase() === `#${tag}`;
            return (
              <button
                key={tag}
                type="button"
                class={`tag-filter${selected ? " is-active" : ""}`}
                aria-pressed={selected}
                onClick={() => onFilterChange(selected ? "" : `#${tag}`)}
              >
                <span>#{tag}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
