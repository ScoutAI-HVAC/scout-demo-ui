"use client";
import {
  ArrowRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  MoonStar,
  PhoneCall,
  PieChart,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardLine } from "@/lib/format";
import { humanizeToken } from "@/lib/pro-case";
export type InsightSeverity = "info" | "attention" | "urgent";
export interface InsightTile {
  id: string;
  rule: string;
  severity: InsightSeverity;
  headline: string;
  body: string;
  suggestedAction?: string;
  amount?: number;
  customerId?: string;
  subjectRef?: string;
  updatedAt?: number;
}
export function readAtNote(tile: InsightTile): string {
  if (tile.rule !== "ar_rollup" || typeof tile.updatedAt !== "number") return "";
  const at = new Date(tile.updatedAt);
  if (Number.isNaN(at.getTime())) return "";
  return ` · as of ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}
const SEVERITY_TONE: Record<
  InsightSeverity,
  {
    accent: string;
    dot: string;
    eyebrow: string;
  }
> = {
  urgent: { accent: "border-l-alarm", dot: "bg-alarm", eyebrow: "text-alarm" },
  attention: {
    accent: "border-l-copper",
    dot: "bg-copper",
    eyebrow: "text-copper",
  },
  info: { accent: "border-l-sage", dot: "bg-sage", eyebrow: "text-sage-deep" },
};
const RULE_LABEL: Record<string, string> = {
  overdue_ar: "Owed to you",
  ar_rollup: "Owed to you",
  gone_quiet: "Gone quiet",
  money_in: "Money in",
  revenue_trend: "Revenue",
  replacement_pipeline: "Replacement lead",
  concentration_risk: "Customer mix",
  ingest_in_progress: "Still importing",
  learned_watch: "Your watch",
  needs_human: "Needs a human",
};
const RULE_ICON: Record<string, LucideIcon> = {
  overdue_ar: Banknote,
  ar_rollup: Banknote,
  gone_quiet: MoonStar,
  money_in: TrendingUp,
  revenue_trend: TrendingUp,
  replacement_pipeline: Wrench,
  concentration_risk: PieChart,
  ingest_in_progress: Download,
  learned_watch: Eye,
  needs_human: PhoneCall,
};
const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  urgent: 0,
  attention: 1,
  info: 2,
};
const CARD_STEP = 302;
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
function flatten(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}
function tileAnchors(tile: InsightTile): string[] {
  return [
    tile.customerId ? `customer ${flatten(tile.customerId, 64)}` : null,
    tile.subjectRef && tile.subjectRef !== tile.customerId
      ? `ref ${flatten(tile.subjectRef, 64)}`
      : null,
  ].filter((part): part is string => part !== null);
}
function actionText(tile: InsightTile): string {
  const anchors = tileAnchors(tile);
  const action = flatten(tile.suggestedAction ?? "", 160);
  const context = flatten(tile.headline, 120);
  return anchors.length > 0
    ? `${action} - ${context} (${anchors.join(", ")})`
    : `${action} - ${context}`;
}
export function discussText(tile: InsightTile): string {
  const anchors = tileAnchors(tile);
  const context = flatten(tile.headline, 160);
  const anchorSuffix = anchors.length > 0 ? ` (${anchors.join(", ")})` : "";
  return (
    `Let's talk about this: "${context}"${anchorSuffix}. ` +
    "Give me your read and lead with the money: what's the chase here and what's it worth? " +
    "If a flow could work this, your first option is offering to build it as a draft for my " +
    'review - never offer "do nothing". A draft sends nothing; do not send any texts from ' +
    "this conversation."
  );
}
export default function InsightTiles({
  onAction,
  onDiscuss,
  dense = false,
}: {
  onAction?: (text: string) => void;
  onDiscuss?: (text: string) => void;
  dense?: boolean;
}) {
  const [tiles, setTiles] = useState<InsightTile[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const [dismissFailed, setDismissFailed] = useState<string | null>(null);
  const syncOverflow = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);
  const page = useCallback((direction: -1 | 1) => {
    railRef.current?.scrollBy({
      left: direction * CARD_STEP,
      behavior: "smooth",
    });
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/insights")
      .then((res) => {
        if (!res.ok) throw new Error("Insights unavailable");
        return res.json();
      })
      .then((data: { insights?: InsightTile[] }) => {
        if (cancelled) return;
        if (!Array.isArray(data.insights)) throw new Error("Insights unavailable");
        const insights = data.insights;
        setUnavailable(false);
        setTiles(
          [...insights].sort(
            (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    syncOverflow();
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncOverflow, tiles]);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && event.deltaY > 0;
      if (atStart || atEnd) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tiles]);
  async function dismiss(id: string) {
    const index = tiles.findIndex((t) => t.id === id);
    if (index === -1) return;
    const tile = tiles[index];
    setTiles((cur) => cur.filter((t) => t.id !== id));
    setDismissFailed(null);
    try {
      const res = await fetch(`/api/insights/${encodeURIComponent(id)}/dismiss`, {
        method: "POST",
        keepalive: true,
      });
      if (!res.ok) throw new Error(`dismiss failed (${res.status})`);
    } catch {
      setTiles((cur) => {
        if (cur.some((t) => t.id === id)) return cur;
        const next = [...cur];
        next.splice(Math.min(index, next.length), 0, tile);
        return next;
      });
      setDismissFailed(id);
    }
  }
  if (unavailable) {
    return (
      <p role="status" className="text-sm text-ink-3">
        Scout couldn’t load the latest insights. Refresh to try again.
      </p>
    );
  }
  if (tiles.length === 0) return null;
  const scrollable = overflow.left || overflow.right;
  return (
    <section aria-label="Scout's insights" className={`mb-5 ${dense ? "" : "sm:mb-7"}`}>
      <div className="mb-2 flex items-center justify-between gap-3 sm:mb-2.5">
        <p className="flex items-center gap-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
          <Sparkles size={12} className="text-terracotta" />
          Scout noticed
          {tiles.length > 1 && <span className="text-ink-4/70">· {tiles.length}</span>}
        </p>
        {scrollable && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => page(-1)}
              disabled={!overflow.left}
              aria-label="Previous insights"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-tan-soft bg-paper text-ink-3 transition-colors hover:border-terracotta hover:text-terracotta-deep disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-tan-soft disabled:hover:text-ink-3"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => page(1)}
              disabled={!overflow.right}
              aria-label="More insights"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-tan-soft bg-paper text-ink-3 transition-colors hover:border-terracotta hover:text-terracotta-deep disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-tan-soft disabled:hover:text-ink-3"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
      <div
        ref={railRef}
        onScroll={syncOverflow}
        tabIndex={0}
        role="group"
        aria-label="Insight cards"
        data-fade-left={overflow.left ? "true" : "false"}
        data-fade-right={overflow.right ? "true" : "false"}
        className="insight-rail flex snap-x gap-3 overflow-x-auto pb-2 focus-visible:outline-none"
      >
        {tiles.map((tile, index) => {
          const tone = SEVERITY_TONE[tile.severity] ?? SEVERITY_TONE.info;
          const RuleIcon = RULE_ICON[tile.rule] ?? Sparkles;
          return (
            <article
              key={tile.id}
              style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
              onClick={onDiscuss ? () => onDiscuss(discussText(tile)) : undefined}
              onKeyDown={
                onDiscuss
                  ? (event) => {
                      if (event.key === "Enter" && event.target === event.currentTarget) {
                        onDiscuss(discussText(tile));
                      }
                    }
                  : undefined
              }
              tabIndex={onDiscuss ? 0 : undefined}
              className={`group animate-fadeIn relative w-[240px] shrink-0 snap-start rounded-2xl border border-tan-soft border-l-[3px] bg-paper p-3 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card ${dense ? "" : "sm:w-[290px] sm:p-4"} ${onDiscuss ? "cursor-pointer" : ""} ${tone.accent}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 sm:mb-1.5">
                <p
                  className={`flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide ${dense ? "" : "sm:text-caption"} ${tone.eyebrow}`}
                >
                  <RuleIcon size={12} strokeWidth={2.25} />
                  {RULE_LABEL[tile.rule] ?? humanizeToken(tile.rule)}
                </p>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void dismiss(tile.id);
                  }}
                  aria-label="Dismiss insight"
                  title="Don't show this again"
                  className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-70 transition-opacity hover:bg-paper-2 hover:text-ink-2 hover:opacity-100 group-hover:opacity-100"
                >
                  <X size={16} />
                </button>
              </div>

              <h3
                title={dashboardLine(tile.headline)}
                className={`font-display line-clamp-2 text-[0.9rem] leading-snug font-medium text-ink ${dense ? "" : "sm:text-[1.05rem]"}`}
              >
                {dashboardLine(tile.headline)}
              </h3>
              {typeof tile.amount === "number" && (
                <p
                  className={`font-tabular mt-0.5 text-body font-semibold text-ink ${dense ? "" : "sm:mt-1.5 sm:text-body-lg"}`}
                >
                  {MONEY.format(tile.amount)}
                </p>
              )}
              {tile.suggestedAction && onAction && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAction(actionText(tile));
                  }}
                  className={`mt-2 inline-flex max-w-full min-w-0 items-center gap-1 py-2 -my-2 text-left text-label font-semibold text-terracotta-deep transition-all hover:gap-2 ${dense ? "" : "sm:mt-2.5"}`}
                >
                  <span
                    className={`truncate ${dense ? "" : "sm:whitespace-normal"}`}
                    title={tile.suggestedAction}
                  >
                    {tile.suggestedAction}
                  </span>
                  <ArrowRight size={12} className="shrink-0" />
                </button>
              )}
              {dismissFailed === tile.id && (
                <p role="alert" className="mt-2 text-label text-alarm">
                  Couldn&apos;t dismiss this.{" "}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void dismiss(tile.id);
                    }}
                    className="font-semibold underline underline-offset-2"
                  >
                    Try again
                  </button>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
