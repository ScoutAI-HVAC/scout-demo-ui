"use client";
import { ArrowUpRight, Bell, ChevronDown, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useChatSuggestions } from "@/components/chat-suggestions";
import { discussText, readAtNote } from "@/components/insight-tiles";
import { useBuddyStore } from "@/lib/buddy-store";
import { dashboardLine } from "@/lib/format";
const SEVERITY = { urgent: 0, attention: 1, info: 2 };
export function ScoutPriorities({ onDiscuss }: { onDiscuss: (text: string) => void }) {
  const suggestions = useChatSuggestions();
  const { unavailable, starters, dismiss, dismissError } = suggestions;
  const insights = suggestions.insights
    .toSorted(
      (a, b) =>
        (SEVERITY[a.severity] ?? 3) - (SEVERITY[b.severity] ?? 3) || a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  const [seen, setSeen] = useState("");
  const fingerprint = insights.map((tile) => `${tile.id}:${tile.headline}`).join("|");
  const { hydrate, ready, enabled: buddyOn, reviewOpen: expanded, setReview } = useBuddyStore();
  const setExpanded = useBuddyStore((s) => s.setReviewOpen);
  useLayoutEffect(() => hydrate(), [hydrate]);
  useEffect(
    () => setReview(insights.length, fingerprint),
    [insights.length, fingerprint, setReview],
  );
  useEffect(() => () => setExpanded(false), [setExpanded]);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) {
      return undefined;
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !panel.current?.contains(target) &&
        !target.closest?.(".scout-buddy, .mobile-attention-button")
      ) {
        setExpanded(false);
      }
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setExpanded(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [expanded, setExpanded]);
  const pill = !(ready && buddyOn);
  return (
    <section aria-label="Scout priorities" className="scout-priorities mx-auto mb-6 max-w-3xl">
      {dismissError && (
        <p role="alert" className="mb-2 text-label text-ink-3">
          Couldn't save that suggestion as reviewed.{" "}
          <button type="button" className="underline" onClick={() => dismiss(dismissError)}>
            Try again
          </button>
        </p>
      )}
      {pill && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="mobile-priority-items"
          onClick={() => {
            setExpanded(!expanded);
            setSeen(fingerprint);
          }}
          className="mobile-attention-button mb-3 flex min-h-11 items-center gap-2 rounded-full bg-paper px-4 text-body font-semibold text-ink shadow-card transition-colors hover:bg-paper-2"
        >
          <Bell
            size={18}
            strokeWidth={1.8}
            aria-hidden="true"
            className={
              insights.length > 0 && fingerprint !== seen
                ? "motion-safe:animate-pulse text-terracotta-deep"
                : "text-ink-3"
            }
          />
          {unavailable
            ? "Check priorities"
            : insights.length
              ? `${insights.length} to review`
              : "Ideas to get started"}
          <ChevronDown
            size={18}
            strokeWidth={1.8}
            aria-hidden="true"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
      <div
        ref={panel}
        id="mobile-priority-items"
        className={!expanded ? "hidden" : "mobile-priority-panel"}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-label font-semibold text-ink">
            {insights.length ? `${insights.length} to review` : "Your next three moves"}
          </h2>
          <button
            type="button"
            aria-label="Close the review list"
            onClick={() => setExpanded(false)}
            className="-my-2 -mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        {unavailable ? (
          <p role="status" className="mb-3 text-label text-ink-3">
            Priorities couldn't refresh.{" "}
            {insights.length ? "Showing the last loaded items." : "Start with a question below."}
          </p>
        ) : null}
        <div className="priority-cards grid gap-2">
          {insights.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => {
                dismiss(tile.id);
                onDiscuss(discussText(tile));
              }}
              className="flex min-w-0 flex-col rounded-2xl bg-paper px-3 py-3.5 text-left shadow-soft transition-colors hover:bg-paper-2"
            >
              <span className="priority-label text-label font-semibold text-terracotta-deep">
                {tile.severity === "urgent"
                  ? "Needs attention"
                  : tile.severity === "attention"
                    ? "Worth a look"
                    : "Scout noticed"}
                {readAtNote(tile)}
              </span>
              <span className="priority-headline mt-1 block grow text-body font-semibold text-ink">
                {dashboardLine(tile.headline)}
              </span>
              <span className="priority-action mt-2 flex items-center gap-1 text-label text-ink-3">
                <span className="sr-only">Let's look at it</span>{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </button>
          ))}
          {starters.slice(0, 3 - insights.length).map((starter) => (
            <button
              key={starter.title}
              type="button"
              onClick={() => {
                suggestions.select(starter.id);
                onDiscuss(starter.prompt);
              }}
              className="flex min-w-0 flex-col rounded-2xl bg-paper px-3 py-3.5 text-left shadow-soft transition-colors hover:bg-paper-2"
            >
              <span className="priority-label text-label text-ink-3">Ask Scout</span>
              <span className="priority-headline mt-1 block grow text-body font-semibold text-ink">
                {starter.title}
              </span>
              <span className="priority-action mt-2 flex items-center gap-1 text-label text-ink-3">
                <span className="sr-only">Take a look</span>{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            </button>
          ))}
          {!insights.length && !starters.length && (
            <p className="text-label text-ink-3">
              You're caught up on these suggestions. New insights will appear here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
