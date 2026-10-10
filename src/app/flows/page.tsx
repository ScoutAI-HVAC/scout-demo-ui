"use client";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  LayoutGrid,
  Plus,
  RefreshCw,
  Rows3,
  Sparkles,
  Sun,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScoutImpactSummary } from "@/components/scout-impact";
import { useShopClock } from "@/components/shop-clock";
import { campaignResult, type CampaignGoal } from "@/lib/campaign-goal";
import { humanizeToken, sentenceCase } from "@/lib/pro-case";
import { unseenFlowIds } from "@/lib/seen-flows";
import { shopAsOf, shopDate, type ShopClock } from "@/lib/shop-time";
import { useScoutImpact } from "@/lib/use-scout-impact";
import { BuilderChat } from "./builder-chat";
import { type CampaignAnalytics, CampaignOverview, TestCampaignTag } from "./campaign-overview";
import { moneyLabel } from "./money-label";
interface FlowSummary {
  id: string;
  goal?: CampaignGoal;
  confirmedBookings?: number;
  testMode?: boolean;
  cancelledBookings?: number;
  name: string;
  scope: "transactional" | "marketing";
  state: "draft" | "awaiting_approval" | "live" | "paused" | "done";
  collectedDollars: number;
  wonDollars?: number;
  latestReply: {
    name: string | null;
    snippet: string;
    atMs: number;
  } | null;
  targeted: number;
  enrolled: number;
  touchesSent: number;
  holding: number;
  holdReason: string | null;
  waiting: number;
  atStakeDollars: number | null;
  atStakeAsOfMs?: number;
  replied: number;
  paid: number;
  booked: number;
  optedOut: number;
  finished: number;
  hasSnapshot: boolean;
  snapshotSummary: string | null;
  createdAtMs?: number;
  launchedAtMs?: number;
  stoppedAtMs?: number;
}
function shortDate(ms: number | undefined, clock: ShopClock): string | null {
  if (!ms) {
    return null;
  }
  return shopDate(ms, clock, { month: "short", day: "numeric" });
}
function timeline(
  flow: {
    state: string;
    createdAtMs?: number;
    launchedAtMs?: number;
    stoppedAtMs?: number;
  },
  clock: ShopClock,
): string | null {
  const launched = shortDate(flow.launchedAtMs, clock);
  const stopped = shortDate(flow.stoppedAtMs, clock);
  if (launched && stopped) {
    return `${launched} – ${stopped}`;
  }
  if (launched) {
    return `Launched ${launched}${flow.state === "live" ? " · running" : ""}`;
  }
  const drafted = shortDate(flow.createdAtMs, clock);
  return drafted ? `Drafted ${drafted}` : null;
}
interface TickReport {
  startedAtMs: number;
  touchesSent: number;
  touchesSkipped: number;
  refusals: Record<string, number>;
  ok: boolean;
}
interface Health {
  lastTick: TickReport | null;
  lastTickAgoMs: number | null;
  everTicked: boolean;
  tickIntervalMs?: number;
}
function cadence(ms: number | undefined): string | null {
  if (!ms || ms <= 0) {
    return null;
  }
  const minutes = Math.round(ms / 60000);
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `every ${hours === 1 ? "hour" : `${hours} hours`}`;
  }
  return `every ${minutes === 1 ? "minute" : `${minutes} minutes`}`;
}
interface InsightCard {
  id: string;
  rule: string;
  headline: string;
  amount?: number;
  updatedAt?: number;
}
function deriveSuggestions(
  cards: InsightCard[],
  clock: ShopClock,
): Array<{
  key: string;
  text: string;
  action: string;
  source: "overdue_ar" | "dormant_customers" | "aging_equipment";
  scope: "transactional" | "marketing";
}> {
  const out: Array<{
    key: string;
    text: string;
    action: string;
    source: "overdue_ar" | "dormant_customers" | "aging_equipment";
    scope: "transactional" | "marketing";
  }> = [];
  const overdue = cards.filter((c) => c.rule === "overdue_ar");
  if (overdue.length > 0) {
    const total = overdue.reduce((sum, c) => sum + (c.amount ?? 0), 0);
    const readAt = Math.min(
      ...overdue.map((c) => (typeof c.updatedAt === "number" ? c.updatedAt : Number.NaN)),
    );
    const asOf = shopAsOf(readAt, clock);
    out.push({
      key: "overdue",
      text: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"} worth $${Math.round(total).toLocaleString("en-US")} are sitting out there${asOf ? `, as of ${asOf}` : ""}.`,
      action: "Build a receivables chase",
      source: "overdue_ar",
      scope: "transactional",
    });
  }
  const quiet = cards.filter((c) => c.rule === "gone_quiet");
  if (quiet.length > 0) {
    out.push({
      key: "quiet",
      text: `${quiet.length} good customer${quiet.length === 1 ? "" : "s"} have gone quiet.`,
      action: "Build a win-back flow",
      source: "dormant_customers",
      scope: "marketing",
    });
  }
  const aging = cards.filter((c) => c.rule === "aging_equipment");
  if (aging.length > 0) {
    out.push({
      key: "aging",
      text: `${aging.length} customer${aging.length === 1 ? "" : "s"} have equipment old enough to talk about replacing.`,
      action: "Build an upgrade flow",
      source: "aging_equipment",
      scope: "marketing",
    });
  }
  return out;
}
interface FlowsResponse {
  flows: FlowSummary[];
  analytics?: CampaignAnalytics | null;
  health: Health | null;
  engineReachable: boolean;
}
function ago(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
function EngineHealth({ data }: { data: FlowsResponse }) {
  if (!data.engineReachable) {
    return (
      <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink">
        <AlertTriangle size={16} className="shrink-0 text-golden" />
        <span>
          The flow engine is not reachable. This list is empty because Scout could not ask, not
          because you have no flows.
        </span>
      </div>
    );
  }
  const health = data.health;
  if (!health?.everTicked) {
    return (
      <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink">
        <AlertTriangle size={16} className="shrink-0 text-golden" />
        <span>
          The engine has never run a cycle. Nothing is being chased yet - this is not the same as
          having nothing due.
        </span>
      </div>
    );
  }
  const tick = health.lastTick;
  const stale = (health.lastTickAgoMs ?? 0) > 60 * 60 * 1000;
  if (tick?.ok && !stale) {
    return (
      <div className="mt-5 flex items-center gap-2 text-label text-ink-3">
        <span className="relative flex h-[7px] w-[7px] shrink-0">
          <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-sage" />
        </span>
        <span>
          Engine live
          {cadence(health.tickIntervalMs) ? ` · cycle ${cadence(health.tickIntervalMs)}` : ""}
          {" · last: "}
          {ago(health.lastTickAgoMs ?? 0)}, {tick.touchesSent} sent, {tick.touchesSkipped} skipped
        </span>
      </div>
    );
  }
  return (
    <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-golden-tint0" />
      </span>
      <span>
        Engine live &middot; last cycle {ago(health.lastTickAgoMs ?? 0)}: {tick?.touchesSent ?? 0}{" "}
        sent, {tick?.touchesSkipped ?? 0} skipped
        {tick && !tick.ok ? " - the cycle reported errors" : ""}
        {stale ? " - that is longer ago than expected" : ""}
      </span>
    </div>
  );
}
const HOLD_WORDS: Record<string, string> = {
  frequency_capped: "they already got a text from us this week",
  opted_out: "they asked us to stop",
  outside_window: "outside your send hours",
  daily_cap: "today's batch is full",
  no_consent: "permission to text has not been recorded",
  ledger_unreadable: "the send ledger could not be read",
  taken_over: "you were handling those conversations",
  unreachable: "texts were not going through",
  errored: "Scout hit a snag preparing them",
  billing_exhausted: "previously held for account balance",
};
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}
function AgentCard({
  flow,
  cadenceLine,
  listView,
  isNew,
}: {
  flow: FlowSummary;
  isNew?: boolean;
  cadenceLine: string | null;
  listView?: boolean;
}) {
  const clock = useShopClock();
  const working = flow.state === "live";
  const result = campaignResult(flow);
  const done = flow.state === "done";
  const resolved = Math.max(0, flow.enrolled - flow.waiting - flow.holding);
  const progress = done
    ? 100
    : flow.enrolled > 0
      ? Math.min(100, Math.round((resolved / flow.enrolled) * 100))
      : 0;
  const ribbon = working
    ? { text: "Working", cls: "bg-sage-tint text-sage-deep" }
    : flow.state === "done"
      ? { text: "Finished", cls: "bg-paper-2 text-ink-2" }
      : flow.state === "paused"
        ? { text: "Paused", cls: "bg-golden-tint text-ink" }
        : { text: "Draft", cls: "bg-paper-2 text-ink-2" };
  const newBadge = isNew ? (
    <span className="shrink-0 rounded-full bg-sage px-2 py-0.5 text-caption font-bold text-on-accent uppercase">
      New
    </span>
  ) : null;
  if (listView) {
    return (
      <a
        href={`/flows/${encodeURIComponent(flow.id)}`}
        className="flex min-h-16 items-center gap-3 rounded-2xl bg-paper px-4 py-3 shadow-soft transition-shadow hover:shadow-card active:bg-paper-2"
      >
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-label font-semibold ${ribbon.cls}`}
        >
          {ribbon.text}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-body font-semibold text-ink">{flow.name}</span>
            {flow.testMode ? <TestCampaignTag /> : null}
            {newBadge}
          </div>
          {timeline(flow, clock) ? (
            <div className="truncate text-label text-ink-3">{timeline(flow, clock)}</div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {result ? (
            <div className="text-body-lg font-semibold tabular-nums text-sage-deep">
              {result.value}
            </div>
          ) : flow.collectedDollars + (flow.wonDollars ?? 0) > 0 ? (
            <div className="text-body-lg font-semibold tabular-nums text-sage-deep">
              ${Math.round(flow.collectedDollars + (flow.wonDollars ?? 0)).toLocaleString("en-US")}
            </div>
          ) : (
            <div className="text-body-lg font-semibold tabular-nums text-ink">
              {flow.enrolled > 0 ? flow.enrolled : flow.targeted}
            </div>
          )}
          <div className="text-label text-ink-3">
            {result?.label ?? moneyLabel(flow) ?? (flow.enrolled > 0 ? "In the chase" : "Ready")}
          </div>
        </div>
      </a>
    );
  }
  return (
    <a
      href={`/flows/${encodeURIComponent(flow.id)}`}
      className="flex flex-col rounded-[20px] bg-paper p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-[var(--ease-ios)] hover:-translate-y-0.5 hover:shadow-card active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label font-semibold ${ribbon.cls}`}
          >
            {working ? <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-sage" /> : null}
            {ribbon.text}
          </span>
          {flow.testMode ? <TestCampaignTag /> : null}
          <span className="ml-auto">{newBadge}</span>
        </div>
        <div className="mt-2.5 text-body-lg leading-snug font-semibold text-ink">{flow.name}</div>
        {timeline(flow, clock) ? (
          <div className="mt-0.5 text-label text-ink-3">{timeline(flow, clock)}</div>
        ) : null}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-2">
          {working && progress < 100 ? (
            <div
              className="relative h-full rounded-full bg-sage"
              style={{ width: `${Math.max(6, progress)}%` }}
            >
              <div className="absolute inset-0 animate-shimmerBar bg-white/30" />
            </div>
          ) : (
            <div
              className={`h-full rounded-full ${done ? "bg-ink-3" : "bg-sage"}`}
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
        {done ? (
          <div className="mt-3 rounded-xl bg-paper-2 px-3 py-2">
            <div className="text-label font-semibold text-ink-3">Wrapped</div>
            <div className="mt-0.5 truncate text-body text-ink-2">
              Outreach finished for {flow.enrolled} customer{flow.enrolled === 1 ? "" : "s"}.
            </div>
          </div>
        ) : flow.latestReply ? (
          <div className="mt-3 rounded-xl bg-paper-2 px-3 py-2">
            <div className="text-label font-semibold text-sage-deep">
              Latest reply
              {(() => {
                const nm = flow.latestReply.name ? shortName(flow.latestReply.name) : "";
                return nm ? ` · ${nm}` : "";
              })()}
            </div>
            <div className="mt-0.5 truncate text-body text-ink-2">
              &ldquo;{flow.latestReply.snippet}&rdquo;
            </div>
          </div>
        ) : flow.state === "live" ? (
          <div className="mt-3 rounded-xl bg-paper-2 px-3 py-2">
            <div className="text-label font-semibold text-sage-deep">
              {flow.holding > 0 ? "Holding" : "Working"}
            </div>
            <div className="mt-0.5 truncate text-body text-ink-2">
              {flow.holding > 0
                ? `${flow.holding} text${flow.holding === 1 ? "" : "s"} held · ${HOLD_WORDS[flow.holdReason ?? ""] ?? humanizeToken(flow.holdReason)}`
                : flow.waiting > 0
                  ? `Texted ${flow.touchesSent}, waiting on ${flow.waiting} ${flow.waiting === 1 ? "reply" : "replies"}`
                  : `Chasing this list${cadenceLine ? ` · checks ${cadenceLine}` : ""}.`}
            </div>

            {flow.holding === 0 && flow.waiting > 0 && flow.atStakeDollars ? (
              <div className="mt-0.5 text-label text-ink-3">
                ${Math.round(flow.atStakeDollars).toLocaleString("en-US")} in play
                {flow.atStakeAsOfMs ? ` as of ${shopAsOf(flow.atStakeAsOfMs, clock)}` : ""}
              </div>
            ) : null}
          </div>
        ) : flow.state === "draft" ? (
          <div className="mt-3 rounded-xl bg-paper-2 px-3 py-2">
            <div className="text-label font-semibold text-ink-3">
              {flow.hasSnapshot ? "Waiting on you" : "Scanning"}
            </div>
            <div className="mt-0.5 truncate text-body text-ink-2">
              {flow.hasSnapshot
                ? flow.targeted > 0
                  ? `${flow.targeted} in the last review. Open to refresh the list.`
                  : "Nobody textable right now. Open to see why."
                : "Scout is reading your book. The list lands here shortly."}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1">
        {(
          [
            [flow.targeted || "—", "Ready"],
            [flow.touchesSent || "—", "Texts sent"],
            flow.goal === "engage"
              ? [flow.waiting, "Awaiting reply"]
              : [flow.touchesSent > 0 ? flow.replied : "—", "Replied"],
            result
              ? [result.value, result.label]
              : [
                  Math.round((flow.collectedDollars || 0) + (flow.wonDollars || 0)).toLocaleString(
                    "en-US",
                  ),
                  moneyLabel(flow) ?? "Collected",
                ],
          ] as Array<[string | number, string]>
        ).map(([n, l], i) => (
          <div key={l} className="min-w-0 text-center">
            <div
              className={`text-title font-semibold tabular-nums ${i === 3 ? "text-sage-deep" : "text-ink"}`}
            >
              {n}
            </div>
            <div className="text-caption leading-tight text-ink-3">{l}</div>
          </div>
        ))}
      </div>

      {flow.cancelledBookings ? (
        <div className="mt-2 text-center text-label text-ink-3">
          {flow.cancelledBookings} booking{flow.cancelledBookings === 1 ? "" : "s"} cancelled
        </div>
      ) : null}
    </a>
  );
}
interface ServerSuggestion {
  id: string;
  title: string;
  why: string;
  composed?: boolean;
  existing?: {
    flowId: string;
    state: string;
  };
  draft: {
    name: string;
    goal?: CampaignGoal;
    segmentSource: string;
    segmentParams: Record<string, number>;
    exclusions?: {
      bookedWithinDays?: number;
      inAnotherFlow?: boolean;
      liveConversation?: boolean;
    };
    touches: Array<{
      dayOffset: number;
      template: string;
    }>;
  };
}
export default function FlowsPage() {
  const router = useRouter();
  const clock = useShopClock();
  const { impact, failed: impactFailed } = useScoutImpact();
  const [data, setData] = useState<FlowsResponse | null>(null);
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (data?.flows) {
      setUnseen(unseenFlowIds(data.flows.map((f) => f.id)));
    }
  }, [data]);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [insightsUnavailable, setInsightsUnavailable] = useState(false);
  const [suggestions, setSuggestions] = useState<ServerSuggestion[]>([]);
  const [refreshingIdeas, setRefreshingIdeas] = useState(false);
  const [ideaPage, setIdeaPage] = useState(0);
  const orderedIdeas = useMemo(() => {
    return suggestions
      .map((s, i) => ({ s, i }))
      .toSorted((a, b) => (a.s.existing ? 1 : 0) - (b.s.existing ? 1 : 0) || a.i - b.i)
      .map((x) => x.s);
  }, [suggestions]);
  const visibleIdeas = useMemo(() => {
    if (orderedIdeas.length <= 3) {
      return orderedIdeas;
    }
    const start = (ideaPage * 3) % orderedIdeas.length;
    return [0, 1, 2].map((k) => orderedIdeas[(start + k) % orderedIdeas.length]);
  }, [orderedIdeas, ideaPage]);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "working" | "finished">("all");
  const [sortBy, setSortBy] = useState<"recent" | "status">("recent");
  const [listView, setListView] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const v = window.localStorage.getItem("scout-flows-view");
    if (v === "list") {
      setListView(true);
    }
  }, []);
  const toggleView = () => {
    setListView((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("scout-flows-view", next ? "list" : "grid");
      }
      return next;
    });
  };
  const refreshSuggestions = async () => {
    setRefreshingIdeas(true);
    try {
      const res = await fetch("/api/flows/suggestions", { cache: "no-store" });
      if (!res.ok) {
        return null;
      }
      const body = (await res.json()) as {
        suggestions?: ServerSuggestion[];
      };
      if (!Array.isArray(body.suggestions)) {
        return null;
      }
      setSuggestions(body.suggestions);
      return body.suggestions;
    } catch {
      return null;
    } finally {
      setRefreshingIdeas(false);
    }
  };
  const [thinking, setThinking] = useState(false);
  const [freshMode, setFreshMode] = useState(false);
  const [freshIdeas, setFreshIdeas] = useState<ServerSuggestion[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!thinking) {
      return undefined;
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/flows/suggestions?ideasOnly=1", {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as {
          suggestions?: ServerSuggestion[];
        };
        const arrivals = (body.suggestions ?? []).filter(
          (s) => s.composed && !knownIdsRef.current.has(s.id),
        );
        if (arrivals.length) {
          setFreshIdeas((prev) => {
            const have = new Set(prev.map((p) => p.id));
            const additions = arrivals.filter((s) => !have.has(s.id));
            return additions.length ? [...prev, ...additions] : prev;
          });
        }
      } catch {}
    };
    const timer = setInterval(() => void poll(), 6000);
    return () => clearInterval(timer);
  }, [thinking]);
  const watchUntilDone = async () => {
    for (let i = 0; i < 54; i++) {
      await new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });
      try {
        const res = await fetch("/api/chat?inflight=1", {
          headers: { "x-scout-chat-thread": "flows" },
          cache: "no-store",
        });
        const body = (await res.json()) as {
          inflight?: boolean;
        };
        if (!body.inflight) {
          return;
        }
      } catch {}
    }
  };
  const thinkDeeper = async () => {
    if (thinking) {
      return;
    }
    setThinking(true);
    setFreshMode(true);
    setFreshIdeas([]);
    knownIdsRef.current = new Set(suggestions.map((s) => s.id));
    const taken = [
      ...suggestions.map((s) => s.title),
      ...(data?.flows ?? []).map((f) => f.name),
    ].join("; ");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-scout-chat-thread": "flows",
          "x-scout-single-flight": "1",
        },
        body: JSON.stringify({
          message:
            "Call crm_getBookDigest ONCE - it returns this shop's whole book shape (service " +
            "mix, cities, seasonality, equipment ages, dormancy, top customers) in one " +
            "result. Do NOT call any other CRM tool; every extra call is owner-visible " +
            "waiting. Then pitch 2-3 UNIQUE outreach flow ideas using the flows_pitch_idea " +
            "tool - one call per idea. HARD RULE - every idea must have a direct path to " +
            "money: a booked job, a paid invoice, a replacement/upgrade quote, or a " +
            "maintenance-plan signup. NEVER pitch data cleanup, 'confirm your info', " +
            "surveys, review requests, or anything that asks the customer to give us " +
            "information instead of offering them service - an owner will never send those. " +
            "Money angles the standing tiers miss: route density (fill a truck day in one " +
            "city or neighborhood), equipment type + age against this region's season " +
            "(condensers before the heat, furnaces before the cold), post-repair windows " +
            "where a replacement quote lands, commercial accounts, top customers due for " +
            "their next visit. This is CREATIVE LEAD REACTIVATION: the segment is OUR reason " +
            "for texting, but every message must give the CUSTOMER a reason to want us back " +
            "- seen sooner because we're nearby, a small problem caught before it breaks in " +
            "the heat, an old system looked at before it quits. Never lead with our " +
            "operations or our records ('we're opening route slots', 'our records show it's " +
            "been 14 months'), and never invent a price or discount. Angles must be " +
            "genuinely different from what already exists (already taken: " +
            taken +
            "). Do NOT create drafts; only pitch ideas.",
        }),
      });
      if (res.status === 409) {
        await watchUntilDone();
      } else if (res.ok && res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done } = await reader.read();
          if (done) {
            break;
          }
        }
      }
      await refreshSuggestions();
    } finally {
      setThinking(false);
    }
  };
  useEffect(() => {
    let alive = true;
    void fetch("/api/chat?inflight=1", {
      headers: { "x-scout-chat-thread": "flows" },
      cache: "no-store",
    })
      .then((res) => res.json())
      .then(async (body: { inflight?: boolean }) => {
        if (!alive || !body.inflight) {
          return;
        }
        knownIdsRef.current = new Set();
        setThinking(true);
        await watchUntilDone();
        if (alive) {
          await refreshSuggestions();
          setThinking(false);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (): Promise<FlowsResponse | null> => {
    try {
      const res = await fetch("/api/flows", { cache: "no-store" });
      const parsed = (await res.json()) as FlowsResponse;
      setData(parsed);
      return parsed;
    } catch {
      setData({ flows: [], health: null, engineReachable: false });
      return null;
    }
  }, []);
  useEffect(() => {
    void load();
    void (async () => {
      try {
        const res = await fetch("/api/insights?surface=receivables", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Insights unavailable");
        }
        const body = (await res.json()) as {
          insights?: InsightCard[];
        };
        if (!Array.isArray(body.insights)) {
          throw new Error("Insights unavailable");
        }
        setInsights(body.insights);
        setInsightsUnavailable(false);
      } catch {
        setInsightsUnavailable(true);
      }
    })();
    void (async () => {
      try {
        const res = await fetch("/api/flows/suggestions", {
          cache: "no-store",
        });
        const body = (await res.json()) as {
          suggestions?: ServerSuggestion[];
        };
        setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
      } catch {}
    })();
  }, [load]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const openBuilder = () => {
    setBuilderOpen(true);
  };
  const draftTouchesFor = (source: string): Array<Record<string, unknown>> =>
    source === "overdue_ar"
      ? [
          {
            dayOffset: 0,
            channel: "sms",
            template:
              "Hi {{customer_first_name}}, this is {{shop_name}}. Invoice {{invoice_number}} " +
              "has an open balance of {{amount_owed}}. You can pay at {{payment_link}} " +
              "or call us at {{shop_phone}}. Thank you!",
          },
          {
            dayOffset: 7,
            channel: "sms",
            template:
              "Hi {{customer_first_name}}, following up from {{shop_name}} on invoice " +
              "{{invoice_number}} ({{amount_owed}}). Happy to help at {{shop_phone}}.",
          },
        ]
      : [
          {
            dayOffset: 0,
            channel: "sms",
            template:
              "Hi {{customer_first_name}}, it's been a while! {{shop_name}} here - want us to " +
              "come take a look before the season hits? Call {{shop_phone}} to set it up.",
          },
        ];
  const createFromSuggestion = async (suggestion: {
    text: string;
    action: string;
    source: string;
    scope: string;
  }) => {
    setBusy("suggest");
    setError(null);
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flow: {
            id: `flow-${Date.now().toString(36)}`,
            name: suggestion.action
              .replace(/^Build an? /, "")
              .replace(/^./, (c) => c.toUpperCase()),
            seed: {
              kind: "insight",
              rule: suggestion.source,
              cardId: "suggestion",
            },
            scope: suggestion.scope,
            goal: suggestion.source === "overdue_ar" ? "collect" : "engage",
            segment: {
              source: suggestion.source,
              params: suggestion.source === "overdue_ar" ? { minDaysOverdue: 10 } : {},
              exclusions: {
                ...(["unsold_estimates", "overdue_ar", "all_customers"].includes(suggestion.source)
                  ? {}
                  : { bookedWithinDays: 90 }),
                inAnotherFlow: true,
                liveConversation: true,
              },
            },
            touches: draftTouchesFor(suggestion.source),
            window: { startHour: 9, endHour: 18 },
            caps: {
              maxTouches: draftTouchesFor(suggestion.source).length,
              cooldownDays: 30,
              dailyBatchSize: 50,
            },
            stopConditions: {
              replied: true,
              booked: true,
              paid: true,
              optedOut: true,
            },
            state: "draft",
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as {
          error?: string;
        };
        setError(body.error ?? "Could not create the draft.");
      }
      await load();
    } finally {
      setBusy(null);
    }
  };
  const createFromServerSuggestion = async (s: ServerSuggestion) => {
    setBusy(s.id);
    setError(null);
    const newId = `flow-${Date.now().toString(36)}`;
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flow: {
            id: newId,
            name: s.draft.name,
            goal: s.draft.goal ?? (s.draft.segmentSource === "overdue_ar" ? "collect" : "engage"),
            seed: {
              kind: "insight",
              rule: s.draft.segmentSource,
              cardId: s.id,
            },
            scope: s.draft.segmentSource === "overdue_ar" ? "transactional" : "marketing",
            segment: {
              source: s.draft.segmentSource,
              params: s.draft.segmentParams,
              exclusions: s.draft.exclusions ?? {
                ...(["unsold_estimates", "overdue_ar", "all_customers"].includes(
                  s.draft.segmentSource,
                )
                  ? {}
                  : { bookedWithinDays: 90 }),
                inAnotherFlow: true,
                liveConversation: true,
              },
            },
            touches: s.draft.touches.map((t) => ({ ...t, channel: "sms" })),
            window: { startHour: 9, endHour: 18 },
            caps: {
              maxTouches: s.draft.touches.length,
              cooldownDays: 30,
              dailyBatchSize: 50,
            },
            stopConditions: {
              replied: true,
              booked: true,
              paid: true,
              optedOut: true,
            },
            state: "draft",
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as {
          error?: string;
        };
        setError(body.error ?? "Could not create the draft.");
        setBusy(null);
        return;
      }
      router.push(`/flows/${newId}`);
    } catch {
      setError("Could not create the draft.");
      setBusy(null);
    }
  };
  if (!data) {
    return <div className="pt-2 text-body text-ink-3">Loading flows…</div>;
  }
  const railIdeas =
    freshMode && (thinking || freshIdeas.length > 0) ? freshIdeas.slice(0, 3) : visibleIdeas;
  const railSlots = thinking && freshMode ? Math.max(0, 3 - freshIdeas.length) : 0;
  const railCard = railIdeas.length + railSlots > 1 ? "w-[82%]" : "w-full";
  return (
    <div className="pt-2">
      <p className="text-label font-bold tracking-[0.14em] uppercase text-ink-3">Chasing</p>
      <h1 className="greeting mt-3 mb-6">
        Money, <em>chased for you.</em>
      </h1>

      <ScoutImpactSummary impact={impact} failed={impactFailed} />
      <CampaignOverview analytics={data.analytics} />

      {suggestions.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="flex items-center gap-2 text-title font-semibold text-ink">
              <span className="h-2 w-2 animate-breathe rounded-full bg-sage" />
              Scout suggests
            </h2>
            {thinking ? (
              <span className="inline-flex items-center gap-1.5 text-body text-sage-deep">
                <Sparkles size={14} strokeWidth={1.8} className="animate-breathe" /> Scout is
                studying your book…
              </span>
            ) : null}
            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setFreshMode(false);
                  setIdeaPage((p) => p + 1);
                  void refreshSuggestions();
                }}
                disabled={refreshingIdeas || thinking}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-paper-2 px-4 text-body font-medium text-ink-2 transition-colors hover:text-ink active:bg-tan-soft disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  strokeWidth={1.8}
                  className={refreshingIdeas ? "animate-spin" : ""}
                />
                Fresh ideas
              </button>

              <button
                type="button"
                onClick={() => void thinkDeeper()}
                disabled={thinking}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-sage-tint px-4 text-body font-semibold text-sage-deep transition-opacity active:opacity-80 disabled:opacity-50"
              >
                <Sparkles size={15} strokeWidth={1.8} /> Think deeper
              </button>
            </div>
          </div>

          <div className="no-scrollbar -mx-4 mb-9 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 py-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {railIdeas.map((s) => {
              const Icon = s.composed
                ? Sparkles
                : s.id.includes("receivables")
                  ? TrendingUp
                  : s.id.includes("dormant")
                    ? UserRound
                    : s.id.includes("summer") || s.id.includes("cooling")
                      ? Sun
                      : CalendarClock;
              return (
                <div
                  key={s.id}
                  className={`flex ${railCard} shrink-0 snap-start flex-col gap-2 rounded-[20px] bg-paper p-4 shadow-soft transition-shadow duration-200 hover:shadow-card sm:w-auto`}
                >
                  <div className="flex items-center gap-2.5 text-body-lg leading-snug font-semibold text-ink">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sage-tint text-sage-deep">
                      <Icon size={16} strokeWidth={1.8} />
                    </span>
                    {s.title}
                  </div>
                  <p className="text-body text-ink-2">{s.why}</p>

                  {s.existing ? (
                    <a
                      href={`/flows/${encodeURIComponent(s.existing.flowId)}`}
                      className="-mb-2 mt-auto inline-flex min-h-11 items-center self-start text-body font-semibold text-sage-deep"
                    >
                      Open your {s.existing.state === "live" ? "flow" : "draft"} &rarr;
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void createFromServerSuggestion(s)}
                      disabled={busy !== null}
                      className="-mb-2 mt-auto min-h-11 self-start text-body font-semibold text-sage-deep disabled:opacity-50"
                    >
                      {busy === s.id ? "Opening the draft…" : "Build this campaign →"}
                    </button>
                  )}
                </div>
              );
            })}
            {Array.from({ length: railSlots }).map((_, i) => (
              <div
                key={`thinking-slot-${i}`}
                className={`flex min-h-[132px] ${railCard} shrink-0 animate-pulse snap-start flex-col items-center justify-center gap-2 rounded-[20px] bg-paper-2 p-4 sm:w-auto`}
              >
                <Sparkles size={16} strokeWidth={1.8} className="text-sage" />
                <span className="text-body text-ink-3">Scout is thinking…</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        deriveSuggestions(insights, clock).map((suggestion) => (
          <div
            key={suggestion.key}
            className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[20px] bg-paper px-4 py-3.5 shadow-soft"
          >
            <p className="min-w-0 flex-1 basis-60 text-body text-ink-2">
              <span className="mr-2 rounded-full bg-sage-tint px-2 py-0.5 text-label font-semibold text-sage-deep">
                Scout noticed
              </span>
              {suggestion.text}
            </p>
            <button
              type="button"
              onClick={() => void createFromSuggestion(suggestion)}
              disabled={busy !== null}
              className="min-h-10 shrink-0 rounded-full bg-paper-2 px-4 text-body font-medium text-ink-2 transition-colors hover:text-ink active:bg-tan-soft disabled:opacity-50"
            >
              {suggestion.action} &rarr;
            </button>
          </div>
        ))
      )}

      {insightsUnavailable ? (
        <p role="status" className="mb-4 text-sm text-ink-3">
          Scout couldn’t load the latest account insights. Refresh to try again.
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="mb-4 rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm">
          {sentenceCase(error)}
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold text-ink">Your campaigns</h2>
          <p className="hidden text-body text-ink-3 sm:block">
            Each campaign has a goal, an audience to review, and Scout handling the replies.
          </p>
        </div>
        <button
          type="button"
          onClick={openBuilder}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-terracotta pr-5 pl-4 text-body font-semibold whitespace-nowrap text-on-accent shadow-soft transition-[filter,transform] hover:brightness-105 active:scale-[0.97] motion-reduce:transition-none"
        >
          <Plus size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          <span>New campaign</span>
        </button>
      </div>

      {data.flows.length === 0 && data.engineReachable ? (
        <p className="text-body text-ink-3">
          No campaigns yet. Pick a goal and Scout will help you find the right customers.
        </p>
      ) : null}

      {data.flows.length > 0
        ? (() => {
            const bucket = (s: string) =>
              s === "live" || s === "paused" ? "working" : s === "done" ? "finished" : "draft";
            const counts = {
              all: data.flows.length,
              draft: 0,
              working: 0,
              finished: 0,
            };
            for (const f of data.flows) {
              counts[bucket(f.state) as "draft" | "working" | "finished"] += 1;
            }
            const filtered = data.flows.filter(
              (f) => statusFilter === "all" || bucket(f.state) === statusFilter,
            );
            const statusRank: Record<string, number> = {
              draft: 0,
              working: 1,
              finished: 2,
            };
            const sorted = [...filtered].toSorted((a, b) => {
              if (sortBy === "status") {
                return statusRank[bucket(a.state)] - statusRank[bucket(b.state)];
              }
              return (
                (b.launchedAtMs ?? b.createdAtMs ?? 0) - (a.launchedAtMs ?? a.createdAtMs ?? 0)
              );
            });
            const TABS: Array<{
              key: typeof statusFilter;
              label: string;
            }> = [
              { key: "all", label: "All" },
              { key: "draft", label: "Draft" },
              { key: "working", label: "Working" },
              { key: "finished", label: "Finished" },
            ];
            return (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="Campaign status"
                    className="ios-segment w-full sm:w-[420px]"
                  >
                    <span
                      aria-hidden="true"
                      className="ios-segment-thumb"
                      style={{
                        left: 2,
                        width: `calc((100% - 4px) / ${TABS.length})`,
                        transform: `translateX(${TABS.findIndex((t) => t.key === statusFilter) * 100}%)`,
                      }}
                    />
                    {TABS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        aria-pressed={statusFilter === t.key}
                        onClick={() => setStatusFilter(t.key)}
                        className={`relative z-[1] flex min-h-10 flex-1 items-center justify-center gap-1 px-1 text-body font-semibold transition-colors ${statusFilter === t.key ? "text-ink" : "text-ink-2 hover:text-ink"}`}
                      >
                        {t.label}
                        <span className="font-medium text-ink-3 tabular-nums">{counts[t.key]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSortBy(sortBy === "recent" ? "status" : "recent")}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-paper-2 px-4 text-body font-medium text-ink-2 transition-colors hover:text-ink active:bg-tan-soft"
                    >
                      <ArrowUpDown size={15} strokeWidth={1.8} aria-hidden="true" />
                      Sort: {sortBy === "recent" ? "Recent" : "Status"}
                    </button>
                    <button
                      type="button"
                      onClick={toggleView}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-paper-2 px-4 text-body font-medium text-ink-2 transition-colors hover:text-ink active:bg-tan-soft"
                    >
                      {listView ? (
                        <LayoutGrid size={15} strokeWidth={1.8} aria-hidden="true" />
                      ) : (
                        <Rows3 size={15} strokeWidth={1.8} aria-hidden="true" />
                      )}
                      {listView ? "Grid" : "List"}
                    </button>
                  </div>
                </div>
                {sorted.length === 0 ? (
                  <p className="text-body text-ink-3">Nothing here yet.</p>
                ) : (
                  <div
                    className={
                      listView
                        ? "flex flex-col gap-2"
                        : "grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
                    }
                  >
                    {sorted.map((flow) => (
                      <AgentCard
                        key={flow.id}
                        flow={flow}
                        isNew={unseen.has(flow.id)}
                        cadenceLine={cadence(data?.health?.tickIntervalMs)}
                        listView={listView}
                      />
                    ))}
                  </div>
                )}
              </>
            );
          })()
        : null}

      <EngineHealth data={data} />

      {builderOpen ? (
        <BuilderChat
          initialAsk=""
          existingFlowIds={(data?.flows ?? []).map((f) => f.id)}
          onClose={() => setBuilderOpen(false)}
          onCreated={(id) => {
            setBuilderOpen(false);
            router.push(`/flows/${encodeURIComponent(id)}`);
          }}
        />
      ) : null}
    </div>
  );
}
