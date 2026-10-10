"use client";
import { Search, X } from "lucide-react";
import { OUTCOME_GROUPS, type OutcomeGroup } from "@/lib/call-outcomes";
export type GroupFilterValue = OutcomeGroup | "all";
export interface HistoryFilterProps {
  group: GroupFilterValue;
  showResultGroups: boolean;
  search: string;
  onGroupChange: (group: GroupFilterValue) => void;
  onSearchInputChange: (value: string) => void;
  onSearchSubmit: () => void;
  onClear: () => void;
}
export function HistoryFilter({
  group,
  showResultGroups,
  search,
  onGroupChange,
  onSearchInputChange,
  onSearchSubmit,
  onClear,
}: HistoryFilterProps) {
  const hasFilters = (showResultGroups && group !== "all") || search.length > 0;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {showResultGroups && (
        <div
          role="tablist"
          aria-label="Filter calls by result"
          className="flex w-fit max-w-full flex-nowrap gap-1 overflow-x-auto rounded-full bg-paper-2 p-1 [&>button]:shrink-0 [&>button]:whitespace-nowrap"
        >
          {OUTCOME_GROUPS.map((g) => {
            const active = group === g.value;
            return (
              <button
                key={g.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onGroupChange(g.value)}
                className={[
                  "inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-body font-semibold transition-colors duration-200",
                  active ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:text-ink-2",
                ].join(" ")}
              >
                {g.dot && <span className={`h-2 w-2 rounded-full ${g.dot}`} />}
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
          className="relative w-full sm:w-80"
        >
          <Search
            size={18}
            strokeWidth={1.8}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3"
          />
          <input
            type="text"
            placeholder="Search caller name or phone…"
            value={search}
            onChange={(e) => onSearchInputChange(e.target.value)}
            aria-label="Search calls by caller name or phone"
            className="min-h-11 w-full rounded-full bg-paper-2 pr-4 pl-11 text-body-lg text-ink placeholder:text-ink-3"
          />
        </form>
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 text-body font-semibold text-ink-2 transition-colors hover:bg-paper-2 active:bg-paper-2"
          >
            <X size={16} strokeWidth={1.8} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
