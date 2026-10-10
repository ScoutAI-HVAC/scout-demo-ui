"use client";
import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useBuddyStore } from "@/lib/buddy-store";
import ScoutBuddyPuppet from "./scout-buddy-puppet";
export default function ScoutBuddy() {
  const path = usePathname();
  const { enabled, tips, ready, hydrate, tipShown, markTipShown, setPreference } = useBuddyStore();
  const { reviewCount, reviewKey, reviewSeenKey, reviewOpen, setReviewOpen, welcome } =
    useBuddyStore();
  const announce = welcome && reviewCount > 0 && reviewKey !== reviewSeenKey && !reviewOpen;
  const [open, setOpen] = useState(false);
  const [away, setAway] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const focusHelp = useRef(false);
  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout>;
    const update = () => {
      const editing = document.activeElement?.closest(
        "input, textarea, select, [contenteditable='true']",
      );
      setAway(document.hidden || Boolean(editing));
    };
    const afterBlur = () => {
      blurTimer = setTimeout(update, 0);
    };
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", afterBlur);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", afterBlur);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [path, enabled, away]);
  useEffect(() => {
    if (!ready || !enabled || !tips || tipShown || away || announce || reviewCount > 0) {
      return undefined;
    }
    const timer = setTimeout(() => {
      markTipShown();
      if (!document.querySelector("dialog[open], [aria-modal='true']")) {
        setOpen(true);
      }
    }, 20000);
    return () => clearTimeout(timer);
  }, [ready, enabled, tips, tipShown, away, announce, reviewCount, markTipShown]);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    if (focusHelp.current) {
      close.current?.focus();
    }
    focusHelp.current = false;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  if (!ready || !enabled || path !== "/chat") {
    return null;
  }
  return (
    <div ref={root} className="scout-buddy" hidden={away} data-open={open || announce}>
      {announce && !open && (
        <aside
          aria-label="Scout has things for you to review"
          className="scout-buddy-card scout-buddy-bubble animate-fadeIn rounded-2xl bg-paper p-3 shadow-lift"
        >
          <div className="flex items-start justify-between gap-1">
            <p className="pt-2 text-body leading-snug text-ink">
              Hey, you have {reviewCount} {reviewCount === 1 ? "thing" : "things"} to review.
            </p>
            <button
              type="button"
              aria-label="Not now"
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-cream"
              onClick={() => setReviewOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-full bg-ink px-3 text-label font-semibold text-paper"
          >
            Take a look <ArrowUpRight size={14} />
          </button>
        </aside>
      )}
      {open && (
        <aside
          id="scout-buddy-help"
          aria-label="Scout buddy help"
          className="scout-buddy-card rounded-2xl border border-tan-soft bg-paper p-3 shadow-lift"
        >
          <div className="flex items-start justify-between gap-1">
            <p className="pt-2 text-label leading-snug text-ink">Need a hand?</p>
            <button
              ref={close}
              type="button"
              aria-label="Close buddy help"
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-cream"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Link
              href="/chat"
              onClick={(event) => {
                setOpen(false);
                if (path === "/chat") {
                  event.preventDefault();
                  document.getElementById("scout-composer")?.focus();
                }
              }}
              className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-ink px-3 text-label font-semibold text-paper"
            >
              Open Chat <ArrowUpRight size={14} />
            </Link>
            <button
              type="button"
              aria-label="Hide buddy"
              title="Hide buddy. Bring him back in Settings."
              className="min-h-11 rounded-full px-3 text-label text-ink-3 hover:bg-cream"
              onClick={() => setPreference("enabled", false)}
            >
              Hide
            </button>
          </div>
        </aside>
      )}
      <button
        ref={trigger}
        type="button"
        aria-label={reviewCount > 0 ? `${reviewCount} to review` : "Open Scout buddy"}
        aria-controls={
          reviewCount > 0 ? "mobile-priority-items" : open ? "scout-buddy-help" : undefined
        }
        aria-expanded={reviewCount > 0 ? reviewOpen : open}
        className="scout-buddy-trigger rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage"
        onClick={() => {
          markTipShown();
          if (reviewCount > 0) {
            setOpen(false);
            setReviewOpen(!reviewOpen);
            return;
          }
          focusHelp.current = !open;
          setOpen(!open);
        }}
      >
        <ScoutBuddyPuppet pose="composer" />
      </button>
    </div>
  );
}
