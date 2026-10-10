"use client";
import { useEffect, useState } from "react";
import { headline } from "@/components/activity-feed";
import { useChatSuggestions } from "@/components/chat-suggestions";
import { discussText, type InsightTile, readAtNote } from "@/components/insight-tiles";
import { dashboardLine } from "@/lib/format";
interface ActivityEvent {
  channel: string;
  direction: string;
  sendClass: string;
  phoneE164: string;
  name: string | null;
  body: string;
  atMs: number;
  kind?: string;
  amount?: number;
  flowName?: string;
}
const POLL_MS = 45000;
const SEVERITY_DOT: Record<string, string> = {
  urgent: "bg-alarm",
  attention: "bg-copper",
  info: "bg-sage",
};
function eventDiscussText(e: ActivityEvent): string {
  const head = headline(e).replace(/\s+/g, " ").trim().slice(0, 160);
  return (
    `Tell me about this: "${head}" (customer ${e.phoneE164}). ` +
    "What happened, and is anything needed from me? Don't take any action yet."
  );
}
const DEV_SAMPLE_EVENTS: ActivityEvent[] =
  process.env.NODE_ENV === "development"
    ? [
        {
          channel: "sms",
          direction: "outbound",
          sendClass: "customer",
          phoneE164: "+15555550102",
          name: "Roy Alvarez (sample)",
          body: "",
          atMs: Date.now() - 300000,
          kind: "paid",
          amount: 297,
          flowName: "Invoice chase",
        },
        {
          channel: "sms",
          direction: "outbound",
          sendClass: "customer-reply",
          phoneE164: "+15555550101",
          name: "Dana Whitfield (sample)",
          body: "",
          atMs: Date.now() - 120000,
        },
        {
          channel: "voice",
          direction: "inbound",
          sendClass: "customer",
          phoneE164: "+15555550105",
          name: "Marge Otis (sample)",
          body: "",
          atMs: Date.now() - 600000,
        },
        {
          channel: "sms",
          direction: "inbound",
          sendClass: "customer",
          phoneE164: "+15555550107",
          name: "Ken Barlow (sample)",
          body: "",
          atMs: Date.now() - 900000,
        },
      ]
    : [];
function snippet(body: string | undefined, max = 44): string {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}
export function curateEvents(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>();
  const out: ActivityEvent[] = [];
  for (const e of [...events].sort((a, b) => b.atMs - a.atMs)) {
    if (e.sendClass === "owner") continue;
    const key = `${e.phoneE164}|${e.kind === "paid" ? "paid" : e.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
export function insightPillLabel(tile: InsightTile): string {
  const line = dashboardLine(tile.headline);
  const amount =
    typeof tile.amount === "number" ? `$${Math.round(tile.amount).toLocaleString("en-US")}` : "";
  return `${line}${amount && !line.includes(amount) ? ` · ${amount}` : ""}${readAtNote(tile)}`;
}
export function pillLabel(e: ActivityEvent): string {
  const head = dashboardLine(headline(e));
  if (e.kind === "paid" || e.channel === "voice") return head;
  const bite = snippet(e.body);
  return bite ? `${head} \u00b7 \u201c${bite}\u201d` : head;
}
export function ActivityTicker({ onDiscuss }: { onDiscuss: (text: string) => void }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const suggestions = useChatSuggestions();
  const { insights } = suggestions;
  const [feedState, setFeedState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [atStake, setAtStake] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [actRes, flowsRes] = await Promise.all([
          fetch("/api/activity?limit=25", { cache: "no-store" }),
          fetch("/api/flows", { cache: "no-store" }).catch(() => null),
        ]);
        let activityRead = false;
        if (!cancelled && actRes.ok) {
          const body = (await actRes.json()) as {
            events?: ActivityEvent[];
          };
          if (Array.isArray(body.events)) {
            setEvents(body.events);
            activityRead = true;
          }
        }
        if (!cancelled) setFeedState(activityRead ? "ready" : "unavailable");
        if (!cancelled && flowsRes?.ok) {
          const body = (await flowsRes.json().catch(() => null)) as {
            flows?: Array<{
              atStakeDollars?: unknown;
            }>;
          } | null;
          const total = (body?.flows ?? []).reduce((sum, f) => {
            const v = Number(f?.atStakeDollars);
            return Number.isFinite(v) && v > 0 ? sum + v : sum;
          }, 0);
          setAtStake(total);
        }
      } catch {
        if (!cancelled) setFeedState("unavailable");
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const buildEventPills = (list: ActivityEvent[], keyPrefix: string) => {
    const curated = curateEvents(list);
    const isRoutineSend = (e: ActivityEvent) =>
      e.channel === "sms" && e.direction === "outbound" && e.kind !== "paid";
    const sends = curated.filter(isRoutineSend);
    const rest = curated.filter((e) => !isRoutineSend(e));
    const eventPill = (e: ActivityEvent) => ({
      key: `${keyPrefix}-${e.channel}-${e.phoneE164}-${e.atMs}`,
      label: pillLabel(e),
      tone: e.kind === "paid" ? ("money" as const) : ("pulse" as const),
      discuss: eventDiscussText(e),
    });
    if (sends.length < 3) {
      return [...rest, ...sends].sort((a, b) => b.atMs - a.atMs).map(eventPill);
    }
    const dollars =
      atStake > 0 ? ` \u00b7 $${Math.round(atStake).toLocaleString("en-US")} in play` : "";
    return [
      {
        key: `${keyPrefix}-outreach-${sends.map((e) => e.atMs).join("-")}`,
        label: `Scout texted ${sends.length} customers${dollars}`,
        tone: atStake > 0 ? ("money" as const) : ("pulse" as const),
        discuss:
          "Tell me about the outreach Scout has going right now - who is being texted, " +
          "and what money is in play? Don't take any action yet.",
      },
      ...rest.map(eventPill),
    ];
  };
  const pills: Array<{
    key: string;
    label: string;
    sub?: string;
    tone: "insight-urgent" | "insight-attention" | "insight-info" | "money" | "pulse";
    discuss: string;
    insightId?: string;
  }> = [
    ...insights.map((tile) => ({
      key: `in-${tile.id}`,
      insightId: tile.id,
      label: insightPillLabel(tile),
      tone: `insight-${tile.severity}` as const,
      discuss: discussText(tile),
    })),
    ...buildEventPills(events, "ev"),
  ].filter((p) => !suggestions.selected.includes(p.key));
  if (pills.length === 0 && DEV_SAMPLE_EVENTS.length === 0) {
    return (
      <div
        data-ticker
        aria-label="Live activity"
        className="mb-4 rounded-pill bg-paper px-4 py-2 text-label text-ink-3 shadow-soft"
      >
        <p role="status">
          {feedState === "loading"
            ? "Checking recent activity…"
            : feedState === "unavailable" || suggestions.unavailable
              ? "Activity feed unavailable. We’ll check again shortly."
              : suggestions.selected.length
                ? "You're caught up. New calls, texts, and updates appear here."
                : "No recent activity yet. New calls, texts, and updates appear here."}
        </p>
      </div>
    );
  }
  if (pills.length === 0) {
    pills.push(...buildEventPills(DEV_SAMPLE_EVENTS, "dev"));
  }
  const pill = (p: (typeof pills)[number], clone: boolean) => (
    <button
      key={`${p.key}${clone ? "-clone" : ""}`}
      type="button"
      aria-hidden={clone || undefined}
      tabIndex={clone ? -1 : undefined}
      onClick={() => {
        if (p.insightId) suggestions.dismiss(p.insightId);
        else suggestions.select(p.key);
        onDiscuss(p.discuss);
      }}
      className={`flex shrink-0 items-center gap-2 rounded-pill px-3.5 py-1.5 text-label font-semibold whitespace-nowrap transition-colors ${
        p.tone === "money"
          ? "bg-sage-tint text-sage-deep hover:bg-sage-soft"
          : p.tone === "pulse"
            ? "bg-paper text-ink-2 shadow-soft hover:bg-paper-2 hover:text-ink"
            : "bg-paper text-ink shadow-soft hover:bg-paper-2"
      }`}
    >
      {p.tone === "money" ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sage text-[10px] font-bold text-paper">
          $
        </span>
      ) : p.tone === "pulse" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-tan" />
      ) : (
        <span
          className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[p.tone.replace("insight-", "")] ?? "bg-sage"}`}
        />
      )}
      {p.label}
    </button>
  );
  const duration = `${Math.max(30, pills.length * 6)}s`;
  return (
    <div
      data-ticker
      aria-label="Live activity"
      className="ticker edge-fade-x group/ticker relative mx-[calc((100%_-_100vw_+_var(--shell-left,0px))/2)] mb-4 overflow-hidden py-1"
    >
      <div
        className="ticker-track flex w-max items-center gap-2.5"
        style={{ animationDuration: duration }}
      >
        <div className="flex items-center gap-2.5 pr-2.5">{pills.map((p) => pill(p, false))}</div>

        <div aria-hidden className="flex items-center gap-2.5 pr-2.5">
          {pills.map((p) => pill(p, true))}
        </div>
      </div>
    </div>
  );
}
