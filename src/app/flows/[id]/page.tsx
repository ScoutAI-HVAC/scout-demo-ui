"use client";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import { useCrmName } from "@/components/crm-link";
import { JourneyDrawer } from "@/components/customer-profile";
import { EngagementBadge, EngagementRubric } from "@/components/engagement-priority";
import InsertVariable, { type PlaceholderOption } from "@/components/insert-variable";
import { useShopClock } from "@/components/shop-clock";
import type { CampaignGoal } from "@/lib/campaign-goal";
import {
  campaignCustomerName,
  humanizeToken,
  looksCommercial,
  proCase,
  sentenceCase,
} from "@/lib/pro-case";
import { markFlowSeen } from "@/lib/seen-flows";
import { shopAsOf, shopDate, type ShopClock } from "@/lib/shop-time";
import { CAMPAIGN_BUTTONS, DELETE_ARM_MS, DELETE_MIN_GAP_MS } from "../campaign-controls";
import { AgentChat } from "./agent-chat";
import type { FlowBookingConfig } from "./bookings-panel";
import { GoalPanel } from "./goal-panel";
interface Recipient {
  subjectRef?: string;
  customerId: string;
  phoneE164: string;
  facts: Record<string, string>;
}
interface Exclusion {
  customerId: string;
  customerName?: string;
  reason: string;
  detail?: string;
  facts?: Record<string, string>;
}
interface Snapshot {
  builtAtMs: number;
  recipients: Recipient[];
  exclusions: Exclusion[];
  warnings: string[];
  truncated: boolean;
}
interface Touch {
  id?: string;
  dayOffset: number;
  channel: string;
  template: string;
}
interface Flow {
  id: string;
  goal?: CampaignGoal;
  replyTools?: Array<"equipment_capture">;
  testRecipientPhone?: string;
  name: string;
  scope: string;
  state: string;
  segment: {
    source: string;
  };
  touches: Touch[];
  window: {
    startHour: number;
    endHour: number;
  };
  schedule?: {
    startsAt: string;
    expiresAt: string;
  };
  caps: {
    maxTouches: number;
    cooldownDays: number;
    dailyBatchSize: number;
  };
  omittedCustomerIds?: string[];
  audienceRevision?: string;
  booking?: FlowBookingConfig;
  createdAtMs?: number;
  launchedAtMs?: number;
  stoppedAtMs?: number;
}
function flowTimeline(
  flow: {
    state: string;
    createdAtMs?: number;
    launchedAtMs?: number;
    stoppedAtMs?: number;
  },
  clock: ShopClock,
): string | null {
  const fmt = (ms?: number) => (ms ? shopDate(ms, clock, { month: "long", day: "numeric" }) : null);
  const launched = fmt(flow.launchedAtMs);
  const stopped = fmt(flow.stoppedAtMs);
  if (launched && stopped) {
    return `Launched ${launched} · stopped ${stopped}`;
  }
  if (launched) {
    return `Launched ${launched}${flow.state === "live" ? " · running now" : ""}`;
  }
  const drafted = fmt(flow.createdAtMs);
  return drafted ? `Drafted ${drafted}` : null;
}
interface Enrollment {
  subjectRef?: string;
  customerId: string;
  phoneE164: string;
  nextTouchIndex: number;
  sentTouchCount?: number;
  nextDueAtMs?: number;
  lastSentAtMs?: number;
  outcome: string;
  lastError?: string;
  facts?: Record<string, string>;
  bookingCancelled?: boolean;
}
function statusOf(e: Enrollment): string {
  return e.outcome === "booked" && e.bookingCancelled ? "booking_cancelled" : e.outcome;
}
function isLiveWin(e: Enrollment): boolean {
  return e.outcome === "paid" || (e.outcome === "booked" && !e.bookingCancelled);
}
function clock12(hour: number): string {
  const whole = Math.floor(hour);
  const minutes = Number.isInteger(hour) ? "00" : "30";
  const meridiem = whole >= 12 ? "PM" : "AM";
  const display = whole % 12 === 0 ? 12 : whole % 12;
  return `${display}:${minutes} ${meridiem}`;
}
const HALF_HOURS = Array.from({ length: 27 }, (_, i) => 8 + i * 0.5);
function zoneLabel(tz: string): string {
  try {
    const short = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    const city = tz.split("/").pop()?.replace(/_/g, " ");
    return short ? `${short}${city ? ` (${city})` : ""}` : (city ?? tz).replace(/_/g, " ");
  } catch {
    return tz.replace(/_/g, " ");
  }
}
interface Detail {
  flow: Flow;
  snapshot: Snapshot | null;
  snapshotSummary: string | null;
  enrollments: Enrollment[];
  atStakeAsOfMs?: number;
  touchStats?: Array<{
    touchIndex: number;
    sent: number;
    replied: number;
  }>;
  tickIntervalMs?: number;
  timezone?: string;
  approval?: StartState;
  preview?: {
    customerName: string | null;
    messages: Array<{
      dayOffset: number;
      text: string | null;
      characters?: number;
      error?: string;
    }>;
  } | null;
}
const REASON_LABELS: Record<string, string> = {
  opted_out: "Stopped by customer",
  booked_recently: "Recent job activity",
  already_paid: "Already paid",
  in_another_flow: "In another flow",
  live_conversation: "Mid-conversation",
  no_phone: "No phone on file",
  contact_unreadable: "Couldn't be looked up - the CRM didn't answer",
  unnamed_invoice: "No invoice number in the book",
  invoice_terms_unavailable: "No verified due date for this message",
  missing_message_data: "Missing information needed by the message",
  frequency_capped: "Contacted this week",
  in_cooldown: "Chased recently",
  unreachable: "Call them - texts aren't getting through",
  not_in_allowlist: "Test mode - not the test phone",
  same_phone: "Same phone as another record - one text sequence per number",
};
const OUTCOME_LABELS: Record<string, string> = {
  active: "Active",
  replied: "Replied",
  booked: "Booked",
  booking_cancelled: "Booked, then cancelled",
  paid: "Paid",
  opted_out: "Opted out",
  done: "Finished",
};
const REFUSAL_WORDS: Record<string, string> = {
  frequency_capped: "they already got a text from us this week",
  opted_out: "they asked us to stop",
  outside_window: "outside your send hours",
  campaign_expired: "dated offer ended",
  campaign_not_started: "waiting for the scheduled start",
  daily_cap: "today's batch is full",
  no_consent: "permission to text has not been recorded",
  ledger_unreadable: "the send ledger could not be read",
  ledger_unavailable: "Scout couldn't check whether they opted out; it will try again",
  in_another_flow: "another live campaign is texting them first; this one waits its turn",
  test_enrollment: "this was a test-mode recipient; rebuild the campaign to text real customers",
  dispatch_receipt_unresolved: "the last message couldn't be confirmed; contact support",
  dispatch_in_progress: "the previous send is still being confirmed",
  errored: "Scout hit an error preparing this message - check the flow's wording",
};
function notJoinedCopy(state: string): string {
  if (state === "paused") {
    return `Not texted yet. They join when you press ${CAMPAIGN_BUTTONS.resume}, if they still qualify.`;
  }
  if (state === "live") {
    return (
      "Not texted. Scout couldn't add them when this campaign started - for example, another " +
      `live campaign is already texting them. Press ${CAMPAIGN_BUTTONS.stop}, then ` +
      `${CAMPAIGN_BUTTONS.resume}, to try again.`
    );
  }
  return "Not texted. This campaign has finished.";
}
function resumeNotice(
  enrolled: number,
  notEnrolled: Array<{
    customerName?: string;
    reason: string;
    detail?: string;
  }>,
): string | null {
  const parts: string[] = [];
  if (enrolled > 0) {
    parts.push(
      `${enrolled} ${enrolled === 1 ? "person" : "people"} added while it was stopped ${enrolled === 1 ? "joins" : "join"} now.`,
    );
  }
  if (notEnrolled.length > 0) {
    const named = notEnrolled.map(
      (row) =>
        `${campaignCustomerName(row.customerName)} (${REASON_LABELS[row.reason] ?? humanizeToken(row.reason)})`,
    );
    parts.push(`Not added: ${named.join("; ")}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
type StartState =
  | {
      state: "checking";
      startedAtMs: number;
      checking: number;
    }
  | {
      state: "started";
      finishedAtMs: number;
      enrolled?: number;
      alreadyInAnotherFlow?: string[];
    }
  | {
      state: "refused";
      finishedAtMs: number;
      error?: string;
      problems?: Array<{
        problem: string;
      }>;
    };
function startedText(enrolled: unknown, elsewhere: unknown): string {
  const count = typeof enrolled === "number" ? enrolled : 0;
  const left = Array.isArray(elsewhere) ? elsewhere.length : 0;
  return `Started: ${count} enrolled${left > 0 ? `. ${left} already in another campaign ${left === 1 ? "was" : "were"} left out.` : ""}`;
}
function refusalText(
  body: {
    error?: unknown;
    problems?: Array<{
      problem: string;
    }>;
  } | null,
  status?: number,
): string {
  return (
    body?.problems?.map((p) => p.problem).join("; ") ||
    (typeof body?.error === "string" && body.error) ||
    `Start didn't get an answer${status ? ` (error ${status})` : ""}. Reload to check whether it began.`
  );
}
const ADDRESS_NAME = /^\d+[a-z]?\s+\S/i;
function rowIdentity(facts: Record<string, string> | undefined): {
  title: string;
  address?: string;
} {
  const account = facts?.customer_name?.trim() ?? "";
  const first = facts?.customer_first_name?.trim() ?? "";
  const person =
    first && first !== "there"
      ? [first, facts?.customer_last_name?.trim()].filter(Boolean).join(" ")
      : "";
  const addressNamed = ADDRESS_NAME.test(account);
  const address = facts?.customer_address?.trim() || (addressNamed ? account : undefined);
  const title = campaignCustomerName(addressNamed ? person : account);
  return { title, ...(address && address !== title ? { address } : {}) };
}
function exclusionFacts(e: {
  customerName?: string;
  facts?: Record<string, string>;
}): Record<string, string> {
  return { ...e.facts, customer_name: e.customerName ?? e.facts?.customer_name ?? "" };
}
function identityText(facts: Record<string, string> | undefined): string {
  const { title, address } = rowIdentity(facts);
  return address ? `${title} ${address}` : title;
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
function sinceSent(atMs: number): string {
  const ms = Date.now() - atMs;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) {
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) {
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  const minutes = Math.max(1, Math.floor(ms / 60000));
  return `${minutes}m ago`;
}
function whenDue(atMs: number | undefined): string {
  if (!atMs) {
    return "soon";
  }
  const ms = atMs - Date.now();
  if (ms <= 0) {
    return "goes out on the next check";
  }
  const days = Math.round(ms / 86400000);
  if (days >= 2) {
    return `in ${days} days`;
  }
  const hours = Math.round(ms / 3600000);
  if (hours >= 1) {
    return hours === 1 ? "in about an hour" : `in about ${hours} hours`;
  }
  return "shortly";
}
const SEGMENT_MONEY: Record<
  string,
  | {
      fact: string;
      label: string;
    }
  | undefined
> = {
  overdue_ar: { fact: "amount_owed", label: "Open balances on the list" },
  dormant_customers: undefined,
  aging_equipment: undefined,
  unsold_estimates: {
    fact: "estimate_total",
    label: "Quoted, not yet answered",
  },
  maintenance_due: undefined,
  replacement_candidates: undefined,
  membership_visits_due: undefined,
  lapsed_memberships: undefined,
};
function polishFact(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean;
}
function docsFromFacts(facts: Record<string, string | undefined> | undefined):
  | {
      title: string;
      items: Array<{
        title: string;
        amount?: number;
        status?: string;
        meta?: string;
      }>;
    }
  | undefined {
  if (!facts) {
    return undefined;
  }
  const owed = dollars(facts.amount_owed);
  if (facts.invoice_number || owed > 0) {
    return {
      title: "Open invoice",
      items: [
        {
          title: facts.invoice_number ? `Invoice ${facts.invoice_number}` : "Outstanding balance",
          amount: owed > 0 ? owed : undefined,
          status: facts.days_overdue ? `${facts.days_overdue} days overdue` : "Open",
        },
      ],
    };
  }
  if (facts.plan_name && (facts.visit_service || facts.visit_due || facts.months_lapsed)) {
    return {
      title: "Membership",
      items: [
        {
          title: polishFact(facts.plan_name),
          status: facts.visit_service
            ? `${polishFact(facts.visit_service)} visit${facts.visit_due ? ` due ${facts.visit_due}` : ""}`
            : facts.months_lapsed
              ? `Ended ${facts.months_lapsed} months ago`
              : "Ended",
        },
      ],
    };
  }
  if (facts.equipment_type || facts.equipment_age || facts.months_since_service) {
    return {
      title: "Equipment on file",
      items: [
        {
          title: facts.equipment_record_label
            ? polishFact(facts.equipment_record_label)
            : facts.equipment_type
              ? polishFact(facts.equipment_type)
              : "System on file",
          status: facts.equipment_age
            ? `About ${facts.equipment_age} years old, based on CRM records`
            : undefined,
          meta: facts.months_since_service
            ? `No service in ${facts.months_since_service} months`
            : undefined,
        },
      ],
    };
  }
  return undefined;
}
function dollars(raw: string | undefined): number {
  const n = Number((raw ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function TemplateText({ text }: { text: string }) {
  const parts = text.split(/(\{\{[a-z_]+\}\})/g);
  return (
    <p className="text-body leading-relaxed text-ink">
      {parts.map((part, i) =>
        /^\{\{[a-z_]+\}\}$/.test(part) ? (
          <span
            key={i}
            className="mx-0.5 rounded-md bg-sage/10 px-1.5 py-0.5 text-label font-medium text-sage"
          >
            {part.slice(2, -2).replaceAll("_", " ")}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
function AgentScan() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mt-3 rounded-[20px] bg-paper p-5 shadow-soft">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-sage" />
        </span>
        <span className="text-body font-semibold text-ink">Scout is scanning your book</span>
        <span className="ml-auto text-label tabular-nums text-ink-3">{elapsed}s</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper-2">
        <div className="h-full w-1/3 animate-shimmerBar rounded-full bg-sage/60" />
      </div>
      <p className="mt-3 text-body text-ink-3">
        Matching your audience rules and exclusions. Larger books can take a few minutes. The
        completed list will include its source facts and any missing-data warnings.
      </p>
    </div>
  );
}
function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] px-4 py-3.5 sm:px-5 ${accent ? "bg-[#2e6154]" : "bg-paper shadow-soft"}`}
    >
      <div className={`text-label font-semibold ${accent ? "text-white/80" : "text-ink-2"}`}>
        {label}
      </div>
      <div
        className={`mt-1 text-[28px] leading-tight font-semibold tracking-[-0.02em] ${accent ? "text-white" : "text-ink"}`}
      >
        {value}
      </div>
      {hint ? (
        <div className={`mt-1 text-label ${accent ? "text-white/75" : "text-ink-3"}`}>{hint}</div>
      ) : null}
    </div>
  );
}
const STATE_PILLS: Record<string, string> = {
  draft: "bg-paper-2 text-ink-2",
  awaiting_approval: "bg-paper-2 text-ink-2",
  live: "bg-sage text-on-accent",
  paused: "bg-golden-tint text-ink",
  done: "bg-paper-2 text-ink-3",
};
const STATE_WORDS: Record<string, string> = {
  awaiting_approval: "Awaiting approval",
  live: "Working",
  done: "Finished",
};
export default function FlowDetailPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const crmName = useCrmName();
  const { displayPhone: formatPhone, displayText } = useCampaignPhonePrivacy();
  const clock = useShopClock();
  const { id } = use(params);
  useEffect(() => {
    markFlowSeen(id);
  }, [id]);
  const router = useRouter();
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteArmedAtRef = useRef(0);
  const deleteDraft = () => {
    if (!deleteArmed) {
      deleteArmedAtRef.current = Date.now();
      setDeleteArmed(true);
      setTimeout(() => setDeleteArmed(false), DELETE_ARM_MS);
      return;
    }
    if (Date.now() - deleteArmedAtRef.current < DELETE_MIN_GAP_MS) {
      return;
    }
    void (async () => {
      const res = await fetch(`/api/flows/${encodeURIComponent(id)}/delete`, {
        method: "POST",
      });
      if (res.ok) {
        router.push("/flows");
      } else {
        setDeleteArmed(false);
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setActionError(body.error ?? "Could not delete this draft.");
      }
    })();
  };
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const loadGenerationRef = useRef(0);
  const load = useCallback(
    async (stillWanted: () => boolean = () => true) => {
      const generation = ++loadGenerationRef.current;
      const current = () => generation === loadGenerationRef.current && stillWanted();
      try {
        const res = await fetch(`/api/flows/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (current()) {
            setMissing(true);
          }
          return null;
        }
        if (!res.ok) {
          throw new Error("Campaign refresh unavailable");
        }
        const next = (await res.json()) as Detail;
        if (current()) {
          setMissing(false);
          setLoadError(null);
          setDetail(next);
        }
        return next;
      } catch {
        if (current()) {
          setLoadError("We couldn't refresh this campaign. Any list shown is the last saved view.");
        }
        return null;
      }
    },
    [id],
  );
  const waitForNewList = useCallback(
    async (builtBefore: number, stopped: () => boolean) => {
      const deadline = Date.now() + 15 * 60000;
      for (;;) {
        if (stopped()) {
          return;
        }
        const next = await load(() => !stopped());
        const builtNow = next?.snapshot?.builtAtMs ?? 0;
        if (builtNow > builtBefore || stopped()) {
          return;
        }
        if (Date.now() > deadline) {
          throw new Error(
            "The audience refresh hasn’t completed. Any list shown is the previous review. Reload to check again.",
          );
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 4000);
        });
      }
    },
    [load],
  );
  const leftPageRef = useRef(false);
  useEffect(() => {
    leftPageRef.current = false;
    return () => {
      leftPageRef.current = true;
    };
  }, [id]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await load();
      if (current && current.flow.state === "draft" && current.approval?.state !== "checking") {
        setScanning(true);
        const builtBefore = current.snapshot?.builtAtMs ?? 0;
        try {
          const scanResponse = await fetch(`/api/flows/${encodeURIComponent(id)}/snapshot`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ unlessFresh: true }),
          });
          if (scanResponse.status === 409) {
            const refused = (await scanResponse.json().catch(() => null)) as {
              approving?: boolean;
            } | null;
            if (refused?.approving) {
              await load(() => !cancelled);
              return;
            }
          }
          if (!scanResponse.ok) {
            throw new Error(
              "The audience refresh couldn’t start. Reload to try again; any list shown is the previous review.",
            );
          }
          const answer = (await scanResponse.json().catch(() => null)) as {
            fresh?: boolean;
          } | null;
          if (answer?.fresh) {
            await load(() => !cancelled);
          } else {
            await waitForNewList(builtBefore, () => cancelled);
          }
        } catch (cause) {
          if (!cancelled) {
            setActionError(
              cause instanceof Error
                ? cause.message
                : "The audience refresh failed. Reload to try again.",
            );
          }
        } finally {
          setScanning(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, load, waitForNewList]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const act = async (action: string) => {
    setBusy(true);
    setActionError(null);
    setActionNotice(null);
    let ok = false;
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(id)}/${action}`, { method: "POST" });
      ok = res.ok;
      if (res.ok && action === "resume") {
        const body = (await res.json().catch(() => null)) as {
          enrolled?: number;
          notEnrolled?: Array<{
            customerName?: string;
            reason: string;
            detail?: string;
          }>;
        } | null;
        setActionNotice(resumeNotice(body?.enrolled ?? 0, body?.notEnrolled ?? []));
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          problems?: Array<{
            problem: string;
          }>;
        };
        setActionError(
          body.problems?.map((p) => p.problem).join("; ") ??
            body.error ??
            `That did not work (error ${res.status}).`,
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
    return ok;
  };
  const [startPressed, setStartPressed] = useState(false);
  const [startAnswer, setStartAnswer] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const checkingStart = detail?.approval?.state === "checking";
  const [startPoll, setStartPoll] = useState(0);
  useEffect(() => {
    if (!checkingStart) {
      return;
    }
    let stopped = false;
    const timer = setTimeout(() => {
      void load(() => !stopped).finally(() => {
        if (!stopped) {
          setStartPoll((n) => n + 1);
        }
      });
    }, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [checkingStart, startPoll, load]);
  const startCampaign = async () => {
    setStartPressed(true);
    setStartAnswer(null);
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(id)}/approve`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as {
        enrolled?: number;
        alreadyInAnotherFlow?: string[];
        error?: string;
        problems?: Array<{
          problem: string;
        }>;
      } | null;
      if (res.status !== 202) {
        setStartAnswer(
          res.ok
            ? { ok: true, text: startedText(body?.enrolled, body?.alreadyInAnotherFlow) }
            : { ok: false, text: refusalText(body, res.status) },
        );
      }
      await load();
    } catch {
      setStartAnswer({
        ok: false,
        text: "Start couldn't reach Scout. Reload to check whether it began.",
      });
    } finally {
      setStartPressed(false);
    }
  };
  const approval = detail?.approval;
  const starting = startPressed || approval?.state === "checking";
  const startResult = starting
    ? null
    : (startAnswer ??
      (approval?.state === "started"
        ? { ok: true, text: startedText(approval.enrolled, approval.alreadyInAnotherFlow) }
        : approval?.state === "refused"
          ? { ok: false, text: refusalText(approval) }
          : null));
  const [struck, setStruck] = useState<Set<string> | null>(null);
  const struckSet = useMemo(
    () => struck ?? new Set(detail?.flow.omittedCustomerIds ?? []),
    [struck, detail],
  );
  const struckWrite = useRef<Promise<unknown>>(Promise.resolve());
  const applyStruck = (next: Set<string>) => {
    const prev = struckSet;
    setStruck(next);
    struckWrite.current = struckWrite.current.then(async () => {
      try {
        const res = await fetch(`/api/flows/${encodeURIComponent(id)}/update`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ omittedCustomerIds: [...next] }),
        });
        if (!res.ok) {
          throw new Error(String(res.status));
        }
      } catch {
        setStruck(prev);
        setActionError("Could not save that change - the list is back to how it was. Try again.");
      }
    });
  };
  const toggleStruck = (customerId: string) => {
    const next = new Set(struckSet);
    if (next.has(customerId)) {
      next.delete(customerId);
    } else {
      next.add(customerId);
    }
    applyStruck(next);
  };
  const [edit, setEdit] = useState<{
    touches: Touch[];
    window: Flow["window"];
  } | null>(null);
  const startEditing = async () => {
    if (!detail) {
      return;
    }
    if (detail.flow.state === "live") {
      const paused = await act("pause");
      if (!paused) {
        return;
      }
    }
    const current = (await load()) ?? detail;
    setEdit({
      touches: current.flow.touches.map((t) => ({ ...t })),
      window: { ...current.flow.window },
    });
  };
  const saveEdit = async () => {
    if (!edit) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(id)}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ touches: edit.touches, window: edit.window }),
      });
      if (!res.ok) {
        const body = (await res.json()) as {
          error?: string;
          problems?: Array<{
            problem: string;
          }>;
        };
        setActionError(
          body.problems?.map((p) => p.problem).join("; ") ?? body.error ?? "Could not save.",
        );
      } else {
        setEdit(null);
      }
      const before = detail;
      const saved = res.ok
        ? ((
            (await res.json().catch(() => null)) as {
              flow?: Flow;
            } | null
          )?.flow ?? null)
        : null;
      await load();
      if (
        saved &&
        before &&
        saved.state === "draft" &&
        saved.audienceRevision !== before.flow.audienceRevision
      ) {
        setScanning(true);
        try {
          await waitForNewList(before.snapshot?.builtAtMs ?? 0, () => leftPageRef.current);
        } catch (cause) {
          if (!leftPageRef.current) {
            setActionError(
              cause instanceof Error
                ? cause.message
                : "The audience refresh failed. Reload to try again.",
            );
          }
        } finally {
          setScanning(false);
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const setTouch = (index: number, patch: Partial<Touch>) => {
    if (!edit) {
      return;
    }
    setEdit({
      ...edit,
      touches: edit.touches.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    });
  };
  const [placeholderOptions, setPlaceholderOptions] = useState<PlaceholderOption[]>([]);
  const placeholderSource = detail?.flow.segment.source;
  useEffect(() => {
    if (!placeholderSource) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/flows/placeholders?source=${encodeURIComponent(placeholderSource)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) {
          return;
        }
        const body = (await res.json()) as {
          placeholders?: PlaceholderOption[];
        };
        if (!cancelled) {
          setPlaceholderOptions(body.placeholders ?? []);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [placeholderSource]);
  const templateRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const insertVariable = (index: number, name: string) => {
    if (!edit) {
      return;
    }
    const current = edit.touches[index]?.template ?? "";
    const el = templateRefs.current[index];
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? start;
    const token = `{{${name}}}`;
    setTouch(index, { template: current.slice(0, start) + token + current.slice(end) });
    requestAnimationFrame(() => {
      const target = templateRefs.current[index];
      if (target) {
        target.focus();
        const caret = start + token.length;
        target.setSelectionRange(caret, caret);
      }
    });
  };
  const [who, setWho] = useState("");
  const [hideBusinesses, setHideBusinesses] = useState(false);
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<
    Array<{
      id: string;
      name: string;
      phone?: string;
    }>
  >([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  useEffect(() => {
    const q = addQuery.trim();
    if (!addOpen || q.length < 2) {
      setAddResults([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/flows/customer-search?q=${encodeURIComponent(q)}`, {
            cache: "no-store",
          });
          if (res.ok && !cancelled) {
            const body = (await res.json()) as {
              results: Array<{
                id: string;
                name: string;
                phone?: string;
              }>;
            };
            setAddResults(body.results);
          }
        } catch {}
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [addQuery, addOpen]);
  const addPerson = async (customerId: string) => {
    setAddingId(customerId);
    setAddError(null);
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(id)}/add-recipient`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      if (res.ok) {
        await load();
        setAddResults((prev) => prev.filter((r) => r.id !== customerId));
      } else {
        const body = (await res.json()) as {
          error?: string;
        };
        setAddError(body.error ?? "Could not add that person.");
      }
    } catch {
      setAddError("Could not add that person.");
    } finally {
      setAddingId(null);
    }
  };
  const [journeyFor, setJourneyFor] = useState<{
    phone: string;
    fallbackName: string | null;
    customerId?: string | null;
    invoiceRef?: string;
    money?: {
      amount: number;
      caption: string;
    };
    whyNow?: string;
    engagementFacts?: Record<string, string>;
    breakdown?: {
      title: string;
      items: Array<{
        title: string;
        amount?: number;
        status?: string;
        meta?: string;
      }>;
    };
  } | null>(null);
  const whoDeferred = useDeferredValue(who);
  const matches = useCallback(
    (name: string | undefined, phone: string | undefined) => {
      const q = whoDeferred.trim().toLowerCase();
      if (!q) {
        return true;
      }
      return (name ?? "").toLowerCase().includes(q) || (phone ?? "").includes(q);
    },
    [whoDeferred],
  );
  const snapshot = detail?.snapshot ?? null;
  const sortedRecipients = useMemo(
    () =>
      (snapshot?.recipients ?? []).filter(
        (r) =>
          matches(identityText(r.facts), r.phoneE164) &&
          (!hideBusinesses || !looksCommercial(r.facts.customer_name)),
      ),
    [snapshot, matches, hideBusinesses],
  );
  const keepVisible = () => {
    const next = new Set(struckSet);
    for (const r of sortedRecipients) {
      next.delete(r.customerId);
    }
    applyStruck(next);
  };
  const skipVisible = () => {
    const next = new Set(struckSet);
    for (const r of sortedRecipients) {
      next.add(r.customerId);
    }
    applyStruck(next);
  };
  const [statusFocus, setStatusFocus] = useState<string | null>(null);
  const filteredEnrollments = useMemo(() => {
    const list = (detail?.enrollments ?? []).filter((e) =>
      matches(identityText(e.facts), e.phoneE164),
    );
    const focused =
      statusFocus === null
        ? list
        : statusFocus === "held"
          ? list.filter((e) => e.lastError === "taken_over")
          : statusFocus === "failing"
            ? list.filter((e) => e.lastError && e.lastError !== "taken_over")
            : list.filter((e) => statusOf(e) === statusFocus);
    const weight = (e: Enrollment) => (e.lastError ? 0 : e.outcome === "active" ? 2 : 1);
    return focused.toSorted((a, b) => weight(a) - weight(b));
  }, [detail, matches, statusFocus]);
  if (missing) {
    return <div className="mx-auto max-w-3xl pt-[8vh] text-body text-ink-3">No such flow.</div>;
  }
  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl pt-[8vh] text-body text-ink-3">
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <button
              type="button"
              className="mt-3 min-h-11 rounded-full bg-paper-2 px-5 font-semibold text-ink-2"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </>
        ) : (
          "Loading…"
        )}
      </div>
    );
  }
  const { flow } = detail;
  const byReason = new Map<string, Exclusion[]>();
  for (const exclusion of snapshot?.exclusions ?? []) {
    byReason.set(exclusion.reason, [...(byReason.get(exclusion.reason) ?? []), exclusion]);
  }
  const outcomeCounts = new Map<string, number>();
  let failing = 0;
  let heldByOwner = 0;
  let coinsPaused = 0;
  let activeCount = 0;
  for (const e of detail.enrollments) {
    outcomeCounts.set(statusOf(e), (outcomeCounts.get(statusOf(e)) ?? 0) + 1);
    if (e.lastError === "taken_over") {
      heldByOwner += 1;
    } else if (e.lastError) {
      failing += 1;
      if (e.lastError === "billing_exhausted") {
        coinsPaused += 1;
      }
    }
    if (e.outcome === "active") {
      activeCount += 1;
    }
  }
  const editable = edit !== null;
  const touchesShown = editable ? edit.touches : flow.touches;
  const selectable = flow.state === "draft";
  const targeted = (snapshot?.recipients ?? []).filter((r) => !struckSet.has(r.customerId));
  const launched = detail.enrollments.length > 0;
  const enrolledIds = new Set(detail.enrollments.map((e) => e.customerId));
  const canAddPeople = (flow.state === "draft" || flow.state === "paused") && snapshot !== null;
  const visibleRecipients = launched
    ? sortedRecipients.filter((r) => !enrolledIds.has(r.customerId) && !struckSet.has(r.customerId))
    : sortedRecipients;
  const showWhoSection = !launched || canAddPeople || visibleRecipients.length > 0 || addOpen;
  const moneyFact = SEGMENT_MONEY[flow.segment.source];
  const atStake = moneyFact
    ? targeted.reduce((sum, r) => sum + dollars(r.facts[moneyFact.fact]), 0)
    : null;
  const excludedCount = snapshot?.exclusions.length ?? 0;
  const checkingCount =
    approval?.state === "checking" && approval.checking > 0 ? approval.checking : targeted.length;
  const struckCount = (snapshot?.recipients ?? []).length - targeted.length;
  const collected = detail.enrollments
    .filter((e) => e.outcome === "paid")
    .reduce((sum, e) => sum + dollars(moneyFact ? e.facts?.[moneyFact.fact] : undefined), 0);
  const won = detail.enrollments
    .filter((e) => !e.bookingCancelled)
    .reduce((sum, e) => sum + dollars(e.facts?.revenue_won), 0);
  return (
    <div className="pt-2">
      <a
        href="/flows"
        className="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-body-lg font-semibold text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink active:bg-paper-2"
      >
        <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" /> Campaigns
      </a>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label font-semibold ${STATE_PILLS[flow.state] ?? "bg-paper-2 text-ink-2"}`}
          >
            {flow.state === "live" ? (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-on-accent" />
              </span>
            ) : null}
            {STATE_WORDS[flow.state] ?? humanizeToken(flow.state)}
          </span>
          <h1 className="mt-2 text-h1 font-semibold tracking-[-0.01em] text-ink">{flow.name}</h1>
          {flowTimeline(flow, clock) ? (
            <div className="mt-0.5 text-body text-ink-3">{flowTimeline(flow, clock)}</div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {flow.state === "draft" && !editable ? (
            <button
              type="button"
              onClick={deleteDraft}
              disabled={starting}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-body font-semibold transition-colors ${deleteArmed ? "bg-alarm-tint text-alarm" : "bg-paper-2 text-ink-2 hover:text-ink"} disabled:opacity-50`}
            >
              <Trash2 size={16} strokeWidth={1.8} />
              {deleteArmed ? CAMPAIGN_BUTTONS.deleteArmed : CAMPAIGN_BUTTONS.delete}
            </button>
          ) : null}
          {flow.state === "draft" && !editable ? (
            <button
              type="button"
              onClick={() => void startCampaign()}
              disabled={busy || starting || scanning || !snapshot || targeted.length === 0}
              title={
                !snapshot || scanning
                  ? "Still scanning your book"
                  : targeted.length === 0
                    ? "Nobody is selected to text"
                    : undefined
              }
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sage px-5 text-body font-semibold text-on-accent shadow-soft transition-colors disabled:bg-tan-soft disabled:text-ink-4 disabled:shadow-none"
            >
              <Play size={16} strokeWidth={1.8} />
              {starting
                ? "Starting…"
                : targeted.length > 0
                  ? `${CAMPAIGN_BUTTONS.start} - text ${targeted.length} ${targeted.length === 1 ? "person" : "people"}`
                  : CAMPAIGN_BUTTONS.start}
            </button>
          ) : null}
          {flow.state === "live" ? (
            <button
              type="button"
              onClick={() => void act("pause")}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-paper-2 px-4 text-body font-semibold text-ink-2 hover:text-ink disabled:opacity-50"
            >
              <Pause size={16} strokeWidth={1.8} /> {CAMPAIGN_BUTTONS.stop}
            </button>
          ) : null}
          {flow.state === "paused" && !editable ? (
            <button
              type="button"
              onClick={() => void act("resume")}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sage px-5 text-body font-semibold text-on-accent shadow-soft disabled:opacity-50"
            >
              <Play size={16} strokeWidth={1.8} /> {CAMPAIGN_BUTTONS.resume}
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-body text-ink-2">
        Texts send {clock12(flow.window.startHour)}-{clock12(flow.window.endHour)} in the
        customer&apos;s time &middot; up to {flow.touches.length}{" "}
        {flow.touches.length === 1 ? "message" : "messages"} each &middot; follows up automatically
      </p>

      {flow.schedule ? (
        <p className="mt-3 rounded-2xl bg-paper px-4 py-3 text-body text-ink-2 shadow-soft">
          <strong>Dated offer:</strong>{" "}
          {new Date(flow.schedule.startsAt).toLocaleString("en-US", {
            timeZone: detail?.timezone ?? "UTC",
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {" → "}
          {new Date(flow.schedule.expiresAt).toLocaleString("en-US", {
            timeZone: detail?.timezone ?? "UTC",
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          ({detail?.timezone ?? "UTC"}). Sending ends automatically at this cutoff.
        </p>
      ) : null}

      <AgentChat
        key={flow.id}
        flowId={flow.id}
        flowName={flow.name}
        flowState={flow.state}
        onFlowChanged={() => void load()}
      />

      {flow.goal === "update_records" && (launched || snapshot) ? (
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          <StatCard
            label={launched ? "Customers texted" : "Will be texted"}
            value={String(
              launched
                ? detail.enrollments.filter((e) => (e.sentTouchCount ?? e.nextTouchIndex) > 0)
                    .length
                : targeted.length,
            )}
            hint={launched ? "At least one message sent" : "Waiting on your approval"}
          />
          <StatCard
            label={launched ? "Replies received" : "Left out"}
            value={String(
              launched
                ? detail.enrollments.filter((e) => e.outcome === "replied").length
                : excludedCount + struckCount,
            )}
            hint={
              launched
                ? "A reply does not confirm a CRM save"
                : "By your choices and the safety rules"
            }
          />
          <StatCard
            label="Record updates"
            value="Customer confirmed"
            hint="Property and unit details verified before saving"
            accent
          />
        </div>
      ) : launched ? (
        (() => {
          const active = detail.enrollments.filter((e) => e.outcome === "active");
          const wonCount = detail.enrollments.filter(isLiveWin).length;
          const cancelledCount = detail.enrollments.filter(
            (e) => e.outcome === "booked" && e.bookingCancelled,
          ).length;
          const replied = detail.enrollments.filter((e) => e.outcome === "replied").length;
          const inPlay = moneyFact
            ? active.reduce((sum, e) => sum + dollars(e.facts?.[moneyFact.fact]), 0)
            : null;
          return (
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_1fr_1.2fr] sm:gap-3">
              <StatCard
                label="In the chase"
                value={String(active.length)}
                hint={`Of ${detail.enrollments.length} in the chase`}
              />
              <StatCard
                label="Money in play"
                value={inPlay === null ? "—" : money(inPlay)}
                hint={
                  moneyFact
                    ? `Still being chased${detail.atStakeAsOfMs ? ` · as of ${shopAsOf(detail.atStakeAsOfMs, clock)}` : ""}`
                    : "This list has no dollar figure"
                }
              />
              <StatCard
                label="Wins"
                value={String(wonCount + replied)}
                hint={
                  (wonCount > 0 || replied > 0
                    ? `${wonCount} paid or booked · ${replied} replied`
                    : "Replies and payments land here") +
                  (cancelledCount > 0
                    ? ` · ${cancelledCount} booking${cancelledCount === 1 ? "" : "s"} cancelled in ${crmName}`
                    : "")
                }
              />
              <StatCard
                label={
                  collected > 0 && won > 0
                    ? "Brought in"
                    : won > 0
                      ? "Won after texting"
                      : "Collected so far"
                }
                value={money(collected + won)}
                hint={
                  collected > 0 && won > 0
                    ? `${money(collected)} collected + ${money(won)} won`
                    : won > 0
                      ? `${money(won)} on invoices dated after the text`
                      : `${detail.enrollments.filter((e) => e.outcome === "paid").length} paid`
                }
                accent
              />
            </div>
          );
        })()
      ) : snapshot ? (
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_1fr_1.2fr] sm:gap-3">
          <StatCard
            label="Will be texted"
            value={String(targeted.length)}
            hint="Waiting on your approval"
          />
          <StatCard
            label="Money at stake"
            value={atStake === null ? "—" : money(atStake)}
            hint={
              moneyFact
                ? `${moneyFact.label} · as of ${shopAsOf(snapshot.builtAtMs, clock)}`
                : "This list has no dollar figure"
            }
          />
          <StatCard
            label="Left out"
            value={String(excludedCount + struckCount)}
            hint={
              struckCount > 0
                ? `${struckCount} by you, rest by safety rules`
                : "By the safety rules"
            }
          />
          <StatCard
            label="Collected so far"
            value="—"
            hint="Starts counting when texts go out"
            accent
          />
        </div>
      ) : null}

      {loadError ? (
        <p role="alert" className="mt-3 rounded-2xl bg-paper p-4 text-body text-ink-2 shadow-soft">
          {loadError}
        </p>
      ) : null}

      {starting ? (
        <div role="status" className="mt-3 rounded-2xl bg-paper p-4 shadow-soft">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-sage" />
            </span>
            <span className="text-body font-semibold text-ink">
              Checking {checkingCount} {checkingCount === 1 ? "customer" : "customers"} against{" "}
              {crmName}…
            </span>
          </div>
          <p className="mt-1.5 text-body text-ink-3">
            Everyone selected is re-checked before anyone is texted. A big list takes a few minutes;
            you can leave this page and it keeps going.
          </p>
        </div>
      ) : startResult?.ok ? (
        <p role="status" className="mt-3 rounded-2xl bg-paper p-4 text-body text-ink-2 shadow-soft">
          {startResult.text}
        </p>
      ) : startResult ? (
        <div role="alert" className="mt-3 rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm">
          {sentenceCase(startResult.text)}
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-3 rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm">
          {sentenceCase(actionError)}
        </div>
      ) : null}
      {actionNotice ? (
        <p role="status" className="mt-3 rounded-2xl bg-paper p-4 text-body text-ink-2 shadow-soft">
          {actionNotice}
        </p>
      ) : null}

      {snapshot?.warnings.length ? (
        <div className="mt-5 rounded-2xl bg-golden-tint p-4">
          {snapshot.warnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2 text-body text-ink">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-golden" />
              <span>{displayText(sentenceCase(warning))}</span>
            </div>
          ))}
          {snapshot.truncated ? (
            <p className="mt-2 text-label text-ink">
              This list was built from an incomplete pull, so it may be missing people.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-10 mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title font-semibold text-ink">What Scout will say</h2>
          <p className="text-body text-ink-3">The words, days, and window are yours to change.</p>
        </div>
        {editable ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEdit(null)}
              disabled={busy}
              className="min-h-10 rounded-full bg-paper-2 px-4 text-body font-medium text-ink-2 hover:text-ink"
            >
              {CAMPAIGN_BUTTONS.discardEdits}
            </button>
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={busy}
              className="min-h-10 rounded-full bg-sage px-4 text-body font-semibold text-on-accent disabled:opacity-50"
            >
              Save changes
            </button>
          </div>
        ) : flow.state !== "done" ? (
          <button
            type="button"
            onClick={() => void startEditing()}
            disabled={busy}
            className="min-h-10 shrink-0 rounded-full bg-paper-2 px-4 text-body font-medium text-ink-2 hover:text-ink disabled:opacity-50"
          >
            {flow.state === "live" ? "Pause & edit" : "Edit"}
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        {touchesShown.map((touch, index) => (
          <div key={index} className="rounded-[20px] bg-paper p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between">
              {editable ? (
                <div className="flex items-center gap-2 text-label text-ink-3">
                  {index === 0 && touch.dayOffset === 0 ? (
                    <span className="rounded-full bg-paper-2 px-2.5 py-1 font-semibold text-ink-2">
                      Right away
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 py-1 pr-1 pl-2.5 font-semibold text-ink-2">
                      Day
                      <input
                        type="number"
                        min={0}
                        value={touch.dayOffset}
                        onChange={(e) => setTouch(index, { dayOffset: Number(e.target.value) })}
                        className="field w-16 rounded-full px-2.5 py-0.5 text-body-lg"
                      />
                    </span>
                  )}
                </div>
              ) : (
                <span className="rounded-full bg-paper-2 px-2.5 py-1 text-label font-semibold text-ink-2">
                  {touch.dayOffset === 0 ? "Right away" : `Day ${touch.dayOffset}`}
                </span>
              )}
              {editable && edit.touches.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setEdit({
                      ...edit,
                      touches: edit.touches.filter((_, i) => i !== index),
                    })
                  }
                  title="Remove this message"
                  aria-label="Remove this message"
                  className="-my-1.5 -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink"
                >
                  <Trash2 size={16} strokeWidth={1.8} />
                </button>
              ) : null}
            </div>
            {editable ? (
              <>
                <textarea
                  ref={(el) => {
                    templateRefs.current[index] = el;
                  }}
                  value={touch.template}
                  onChange={(e) => setTouch(index, { template: e.target.value })}
                  rows={3}
                  className="field mt-3 w-full resize-y rounded-2xl px-3.5 py-3 text-body-lg"
                />
                <div className="mt-1.5">
                  <InsertVariable
                    options={placeholderOptions}
                    onInsert={(name) => insertVariable(index, name)}
                  />
                </div>
              </>
            ) : (
              <div className="mt-2">
                <TemplateText text={touch.template} />

                {(() => {
                  const rendered = detail.preview?.messages[index];
                  if (!rendered) {
                    return null;
                  }
                  if (rendered.text === null) {
                    return (
                      <div className="mt-2 rounded-xl bg-golden-tint px-3 py-2 text-body text-ink">
                        This message cannot send as written: {rendered.error}
                      </div>
                    );
                  }
                  const characters = rendered.characters ?? rendered.text.length;
                  return (
                    <details open className="group mt-2">
                      <summary className="cursor-pointer list-none text-body text-ink-3 hover:text-ink-2">
                        <span className="group-open:hidden">
                          Preview as{" "}
                          {campaignCustomerName(detail.preview?.customerName, "this customer")} sees
                          it →
                        </span>
                        <span className="hidden group-open:inline">
                          Message preview ·{" "}
                          {campaignCustomerName(detail.preview?.customerName, "this customer")}
                        </span>
                      </summary>
                      <div className="mt-2 max-w-[320px] rounded-[20px] rounded-bl-md bg-sage-tint px-3.5 py-2.5 text-body text-ink [overflow-wrap:anywhere]">
                        {displayText(rendered.text)}
                      </div>
                      <div className="mt-1 text-label text-ink-3">{characters} characters</div>
                    </details>
                  );
                })()}
              </div>
            )}

            {(() => {
              if (editable) {
                return null;
              }
              const stat = Array.isArray(detail.touchStats)
                ? detail.touchStats.find(
                    (t) =>
                      t !== null &&
                      typeof t === "object" &&
                      t.touchIndex === index &&
                      Number.isFinite(t.sent) &&
                      Number.isFinite(t.replied),
                  )
                : undefined;
              if (!stat || stat.sent <= 0 || stat.replied > stat.sent) {
                return null;
              }
              const rate = Math.min(100, Math.max(0, Math.round((stat.replied / stat.sent) * 100)));
              return (
                <div className="mt-2 text-label text-ink-3">
                  Sent to {stat.sent} · {stat.replied} replied ({rate}%)
                </div>
              );
            })()}
          </div>
        ))}
        {editable && edit.touches.length < 5 ? (
          <button
            type="button"
            onClick={() =>
              setEdit({
                ...edit,
                touches: [
                  ...edit.touches,
                  {
                    dayOffset: (edit.touches[edit.touches.length - 1]?.dayOffset ?? 0) + 3,
                    channel: "sms",
                    template: "Hi {{customer_first_name}}, ",
                  },
                ],
              })
            }
            className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-[20px] bg-paper-2 px-4 text-body font-medium text-ink-2 hover:text-ink"
          >
            <Plus size={16} strokeWidth={1.8} /> Add a message
          </button>
        ) : null}
      </div>

      {editable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-body text-ink-2">
          <span>Send window</span>
          <select
            value={edit.window.startHour}
            onChange={(e) =>
              setEdit({
                ...edit,
                window: { ...edit.window, startHour: Number(e.target.value) },
              })
            }
            className="select-warm min-h-10 max-w-36"
          >
            {HALF_HOURS.filter((h) => h < 21).map((h) => (
              <option key={h} value={h}>
                {clock12(h)}
              </option>
            ))}
          </select>
          <span>to</span>
          <select
            value={edit.window.endHour}
            onChange={(e) =>
              setEdit({
                ...edit,
                window: { ...edit.window, endHour: Number(e.target.value) },
              })
            }
            className="select-warm min-h-10 max-w-36"
          >
            {HALF_HOURS.filter((h) => h > 8).map((h) => (
              <option key={h} value={h}>
                {clock12(h)}
              </option>
            ))}
          </select>
          {detail?.timezone ? (
            <span className="text-label text-ink-3" title="Set per shop in Scout's setup">
              {zoneLabel(detail.timezone)} &middot; texts also respect each customer&apos;s own
              timezone
            </span>
          ) : null}
        </div>
      ) : null}

      {detail ? (
        <GoalPanel
          key={`${detail.flow.state}-${detail.flow.goal}-${JSON.stringify(detail.flow.booking ?? null)}`}
          flowId={id}
          flow={detail.flow}
          onSaved={load}
        />
      ) : null}

      {detail.flow.replyTools?.includes("equipment_capture") && (
        <section className="mt-6 rounded-[20px] bg-paper p-5 shadow-soft">
          <h2 className="text-body-lg font-semibold">Equipment updates</h2>
          <p className="mt-2 text-body text-ink-3">
            Approving this agent lets Scout collect customer-confirmed make, model, and serial
            numbers and save them to the correct property in your CRM. Existing facts are preserved
            when details conflict. This does not record a service visit.
            {detail.flow.testRecipientPhone
              ? " This is a controlled operator test. Only the operator’s own CRM contact can be updated."
              : ""}
          </p>
        </section>
      )}
      {showWhoSection ? (
        <>
          <div className="mt-10 mb-2 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-title font-semibold text-ink">
                {!launched
                  ? "Who gets texted"
                  : flow.state === "paused"
                    ? "Waiting to join"
                    : "Not on this campaign"}
              </h2>
              <p className="text-body text-ink-3">
                {launched
                  ? visibleRecipients.length > 0
                    ? notJoinedCopy(flow.state)
                    : "Everyone on this list is active below."
                  : "Scout scanned your book and proposes these people"}
              </p>
            </div>

            {canAddPeople ? (
              <button
                type="button"
                onClick={() => {
                  setAddOpen((o) => !o);
                  setAddError(null);
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-paper-2 px-4 text-body font-medium whitespace-nowrap text-ink-2 hover:text-ink"
              >
                {!addOpen && (
                  <Plus size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
                )}
                <span>{addOpen ? "Done adding" : "Add people"}</span>
              </button>
            ) : null}
          </div>
          {addOpen ? (
            <div className="mt-3 mb-3 rounded-[20px] bg-paper p-3 shadow-soft">
              <div className="relative">
                <Search
                  size={16}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute top-3.5 left-4 text-ink-3"
                />
                <input
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  autoFocus
                  placeholder="Search your customers by name (e.g. Jack)…"
                  className="field min-h-11 w-full rounded-full py-0 pr-4 pl-10 text-body-lg"
                />
              </div>
              {addError ? (
                <div className="mt-2 text-label text-alarm">{sentenceCase(addError)}</div>
              ) : null}
              {addResults.length > 0 ? (
                <div className="mt-2 max-h-56 overflow-y-auto">
                  {addResults.map((r) => (
                    <div
                      key={r.id}
                      className="ios-sep flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-body text-ink">{displayText(r.name)}</div>
                        {r.phone ? (
                          <div className="truncate text-label text-ink-3">
                            {formatPhone(r.phone)}
                          </div>
                        ) : (
                          <div className="text-label text-alarm">No phone on file</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={addingId === r.id || !r.phone}
                        onClick={() => void addPerson(r.id)}
                        className="min-h-9 shrink-0 rounded-full bg-sage px-4 text-body font-semibold text-on-accent disabled:opacity-50"
                      >
                        {addingId === r.id ? "Adding…" : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : addQuery.trim().length >= 2 ? (
                <div className="mt-2 text-label text-ink-3">No customers match that name.</div>
              ) : null}
            </div>
          ) : null}
          {snapshot ? (
            <>
              {selectable && sortedRecipients.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-sage bg-sage">
                      <Check size={11} className="text-on-accent" strokeWidth={3} />
                    </span>
                    Will be texted
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 rounded-md border-[1.5px] border-ink-4" />
                    Skipped · tap any row to switch
                  </span>
                </div>
              ) : null}

              {!launched && (snapshot.recipients.length > 8 || excludedCount > 8) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search
                      size={16}
                      strokeWidth={1.8}
                      className="pointer-events-none absolute top-3.5 left-4 text-ink-3"
                    />
                    <input
                      value={who}
                      onChange={(e) => setWho(e.target.value)}
                      placeholder={`Search ${snapshot.recipients.length.toLocaleString("en-US")} people by name or phone`}
                      className="field min-h-11 w-full rounded-full py-0 pr-4 pl-10 text-body-lg"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setHideBusinesses((v) => !v)}
                    aria-pressed={hideBusinesses}
                    title="Best guess from the account name - your keep/skip boxes stay the final word"
                    className={`min-h-11 rounded-full px-4 text-body font-semibold transition-colors ${
                      hideBusinesses
                        ? "bg-sage-tint text-sage-deep"
                        : "bg-paper-2 text-ink-2 hover:text-ink"
                    }`}
                  >
                    Hide businesses
                  </button>
                </div>
              )}

              <EngagementRubric />

              {selectable && sortedRecipients.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={keepVisible}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-sage px-4 text-body font-semibold text-on-accent"
                  >
                    <Check size={15} strokeWidth={2.5} />
                    Keep these {sortedRecipients.length.toLocaleString("en-US")}
                  </button>
                  <button
                    type="button"
                    onClick={skipVisible}
                    className="min-h-10 rounded-full bg-paper-2 px-4 text-body font-semibold text-ink-2 hover:text-ink"
                  >
                    Skip these {sortedRecipients.length.toLocaleString("en-US")}
                  </button>
                  <span className="text-body text-ink-3">
                    {who.trim()
                      ? "Acting on the people matching your filters"
                      : "Acting on the whole list"}
                    {" · "}
                    {targeted.length.toLocaleString("en-US")} will be texted
                  </span>
                </div>
              ) : null}

              {launched && visibleRecipients.length === 0 ? null : (
                <div className="relative mt-3 max-h-[360px] overflow-y-auto overscroll-contain rounded-[20px] bg-paper shadow-soft">
                  {visibleRecipients.map((r) => {
                    const off = struckSet.has(r.customerId);
                    const identity = rowIdentity(r.facts);
                    const chosenBecauseRaw = r.facts.days_overdue
                      ? `${r.facts.days_overdue} days overdue${r.facts.invoice_number ? ` on ${r.facts.invoice_number}` : ""}`
                      : r.facts.months_since_service
                        ? `no service in ${r.facts.months_since_service} months${r.facts.equipment_type ? ` (${proCase(r.facts.equipment_type)})` : ""}`
                        : r.facts.repair_count
                          ? `${r.facts.equipment_type ? `${proCase(r.facts.equipment_type)}, ` : ""}${r.facts.equipment_age ? `${r.facts.equipment_age} yrs, ` : ""}${r.facts.repair_count} repair visits`
                          : r.facts.equipment_age
                            ? `${r.facts.equipment_type ? `${proCase(r.facts.equipment_type)} ` : "equipment "}is ${r.facts.equipment_age} years old`
                            : r.facts.months_since_visit
                              ? `no visit in about ${r.facts.months_since_visit} months`
                              : r.facts.months_quiet
                                ? `about ${r.facts.months_quiet} months since recorded activity`
                                : r.facts.days_since_quote
                                  ? `quote${r.facts.estimate_number ? ` ${r.facts.estimate_number}` : ""} open ${r.facts.days_since_quote} days`
                                  : r.facts.visit_service
                                    ? `${r.facts.visit_service} visit${r.facts.visit_due ? ` due ${r.facts.visit_due}` : ""} on ${r.facts.plan_name ?? "their plan"}`
                                    : r.facts.plan_name
                                      ? `${r.facts.plan_name} ended${r.facts.months_lapsed ? ` ${r.facts.months_lapsed} months ago` : ""}`
                                      : undefined;
                    const chosenBecause = chosenBecauseRaw
                      ? sentenceCase(chosenBecauseRaw)
                      : undefined;
                    const inner = (
                      <>
                        {selectable ? (
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] ${off ? "border-ink-4" : "border-sage bg-sage"}`}
                          >
                            {!off && <Check size={13} className="text-on-accent" strokeWidth={3} />}
                            <input
                              type="checkbox"
                              checked={!off}
                              onChange={() => toggleStruck(r.customerId)}
                              className="sr-only"
                            />
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-body font-medium text-ink sm:truncate">
                            {identity.title}
                            {looksCommercial(r.facts.customer_name) ? (
                              <span
                                title="Best guess from the name"
                                className="ml-1.5 rounded-full bg-paper-2 px-1.5 py-0.5 text-caption font-semibold text-ink-3"
                              >
                                Business?
                              </span>
                            ) : null}
                          </span>
                          {identity.address ? (
                            <span className="block truncate text-label text-ink-3">
                              {identity.address}
                            </span>
                          ) : null}
                          <span className="block truncate text-label text-ink-3">
                            {chosenBecause ? `${chosenBecause} · ` : ""}
                            {formatPhone(r.phoneE164)}
                          </span>
                        </span>
                        <span className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left sm:block sm:text-right">
                          <span className="block text-body font-semibold text-ink">
                            {r.facts.amount_owed ?? ""}
                          </span>
                          <EngagementBadge facts={r.facts} />
                          {r.facts.days_overdue ? (
                            <span className="block text-label text-ink-3">
                              {r.facts.days_overdue} days out
                            </span>
                          ) : null}
                        </span>
                      </>
                    );
                    const whyNowLine = chosenBecause ? `On this list: ${chosenBecause}` : undefined;
                    const openRecipientProfile = (e: {
                      preventDefault: () => void;
                      stopPropagation: () => void;
                    }) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setJourneyFor({
                        phone: r.phoneE164,
                        fallbackName: identity.title,
                        customerId: r.customerId,
                        invoiceRef: flow.segment.source === "overdue_ar" ? r.subjectRef : undefined,
                        money:
                          dollars(r.facts.amount_owed) > 0
                            ? {
                                amount: dollars(r.facts.amount_owed),
                                caption: r.facts.invoice_number
                                  ? `Owed on invoice ${r.facts.invoice_number}`
                                  : "At stake in this flow",
                              }
                            : undefined,
                        whyNow: whyNowLine,
                        engagementFacts: r.facts,
                        breakdown: docsFromFacts(r.facts),
                      });
                    };
                    return selectable ? (
                      <label
                        key={r.customerId}
                        className={`ios-sep grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 has-[:focus-visible]:bg-sage-tint/60 hover:bg-cream/50 sm:flex sm:gap-3 sm:py-2.5 ${off ? "opacity-50" : ""}`}
                      >
                        {inner}
                        <button
                          type="button"
                          onClick={openRecipientProfile}
                          aria-label={`View profile for ${identity.title}`}
                          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-paper-2 px-3.5 text-body font-medium text-ink-2 hover:text-ink"
                        >
                          <UserRound size={16} strokeWidth={1.8} aria-hidden="true" />
                          Profile
                        </button>
                      </label>
                    ) : (
                      <button
                        key={r.customerId}
                        type="button"
                        onClick={() =>
                          setJourneyFor({
                            phone: r.phoneE164,
                            fallbackName: identity.title,
                            customerId: r.customerId,
                            engagementFacts: r.facts,
                          })
                        }
                        className={`ios-sep flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cream/40 ${off ? "opacity-50" : ""}`}
                      >
                        {inner}
                      </button>
                    );
                  })}
                  {visibleRecipients.length === 0 ? (
                    <p className="px-4 py-4 text-body text-ink-3">
                      {who.trim()
                        ? "Nobody targetable matches those filters."
                        : "Nobody is targetable right now - everyone Scout found is listed below with the reason they were left out."}
                    </p>
                  ) : null}
                </div>
              )}

              {!launched && byReason.size > 0 ? (
                <div className="mt-5">
                  <h3 className="mb-2.5 text-body-lg font-semibold text-ink">
                    Left out by the safety rules
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {[...byReason.entries()]
                      .toSorted((a, b) => b[1].length - a[1].length)
                      .map(([reason, list]) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setOpenReason(openReason === reason ? null : reason)}
                          aria-pressed={openReason === reason}
                          className={`min-h-9 rounded-[18px] px-3.5 py-1.5 text-left text-body ${
                            openReason === reason
                              ? "bg-sage font-semibold text-on-accent"
                              : "bg-paper-2 text-ink-2 hover:text-ink"
                          }`}
                        >
                          {list.length} &middot; {REASON_LABELS[reason] ?? humanizeToken(reason)}
                        </button>
                      ))}
                  </div>
                  {openReason ? (
                    <div className="relative mt-3 max-h-72 overflow-y-auto overscroll-contain rounded-[20px] bg-paper shadow-soft">
                      {(byReason.get(openReason) ?? [])
                        .filter((e) => matches(identityText(exclusionFacts(e)), undefined))
                        .toSorted(
                          (a, b) => dollars(b.facts?.amount_owed) - dollars(a.facts?.amount_owed),
                        )
                        .map((e) => {
                          const identity = rowIdentity(exclusionFacts(e));
                          return (
                            <div
                              key={`${e.customerId}-${e.reason}`}
                              className="ios-sep flex items-center justify-between gap-3 px-4 py-2.5"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-body text-ink-2">
                                  {identity.title}
                                  {e.detail ? (
                                    <span className="ml-2 text-label text-ink-3">
                                      {sentenceCase(e.detail ?? "")}
                                    </span>
                                  ) : null}
                                </span>
                                {identity.address ? (
                                  <span className="block truncate text-label text-ink-3">
                                    {identity.address}
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-right text-label text-ink-3">
                                {e.facts?.amount_owed ?? ""}
                                {e.facts?.days_overdue ? ` · ${e.facts.days_overdue}d` : ""}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : scanning ? (
            <AgentScan />
          ) : (
            <div className="mt-3 rounded-[20px] bg-paper px-4 py-4 text-body text-ink-3 shadow-soft">
              No recipient list yet.
            </div>
          )}
        </>
      ) : null}

      <div className="mt-10 mb-3">
        <h2 className="text-title font-semibold text-ink">How it&apos;s going</h2>
        <p className="text-body text-ink-3">
          Every conversation this flow started, and where it stands.
        </p>
      </div>
      {detail.enrollments.length === 0 ? (
        <p className="text-body text-ink-3">
          Nobody has been texted yet
          {flow.state === "draft" ? " - this flow hasn't started" : ""}.
        </p>
      ) : (
        <>
          {flow.state === "live" ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-sage-tint px-4 py-3 text-body text-ink-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-sage" />
              </span>
              <span className="font-semibold text-ink">Scout is working this list</span>
              <span className="text-ink-3">
                &middot; watching {activeCount} conversation
                {activeCount === 1 ? "" : "s"} for replies
                {cadence(detail.tickIntervalMs)
                  ? ` · checks ${cadence(detail.tickIntervalMs)}`
                  : ""}
              </span>
            </div>
          ) : null}
          {coinsPaused > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink">
              <span className="font-semibold">Paused until you top up Coins</span>
              <span>
                &middot; {coinsPaused} {coinsPaused === 1 ? "message" : "messages"} waiting
              </span>
              <a href="/coins" className="font-semibold underline">
                Top up Coins
              </a>
            </div>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2">
            {[...outcomeCounts.entries()].map(([outcome, count]) => (
              <button
                key={outcome}
                type="button"
                onClick={() => setStatusFocus(statusFocus === outcome ? null : outcome)}
                aria-pressed={statusFocus === outcome}
                className={`min-h-9 rounded-full px-3.5 text-body ${
                  statusFocus === outcome
                    ? "bg-sage font-semibold text-on-accent"
                    : "bg-paper-2 text-ink-2 hover:text-ink"
                }`}
              >
                {count} {OUTCOME_LABELS[outcome] ?? humanizeToken(outcome)}
              </button>
            ))}
            {heldByOwner > 0 ? (
              <button
                type="button"
                onClick={() => setStatusFocus(statusFocus === "held" ? null : "held")}
                aria-pressed={statusFocus === "held"}
                className={`min-h-9 rounded-full px-3.5 text-body ${
                  statusFocus === "held"
                    ? "bg-sage font-semibold text-on-accent"
                    : "bg-sage-tint text-sage-deep hover:opacity-80"
                }`}
              >
                {heldByOwner} you&apos;re handling
              </button>
            ) : null}
            {failing > 0 ? (
              <button
                type="button"
                onClick={() => setStatusFocus(statusFocus === "failing" ? null : "failing")}
                aria-pressed={statusFocus === "failing"}
                className={`min-h-9 rounded-full px-3.5 text-body ${
                  statusFocus === "failing"
                    ? "bg-ink font-semibold text-paper"
                    : "bg-golden-tint text-ink hover:opacity-80"
                }`}
              >
                {failing} not sending
              </button>
            ) : null}
          </div>
          <div className="relative max-h-[420px] overflow-y-auto overscroll-contain rounded-[20px] bg-paper shadow-soft">
            {filteredEnrollments.map((e) => {
              const sent = e.sentTouchCount ?? e.nextTouchIndex;
              const total = Math.max(
                sent,
                Math.min(
                  flow.caps.maxTouches,
                  sent + Math.max(0, flow.touches.length - e.nextTouchIndex),
                ),
              );
              const stake = e.facts?.amount_owed;
              const invoice = e.facts?.invoice_number;
              const next = (() => {
                if (e.outcome === "opted_out") {
                  return "Stopped - they opted out";
                }
                if (e.outcome === "paid") {
                  return "Done - they paid";
                }
                if (e.outcome === "booked") {
                  return e.bookingCancelled
                    ? `Booked, then cancelled in ${crmName}`
                    : "Done - they booked";
                }
                if (e.outcome === "replied") {
                  return "You're up - they wrote back";
                }
                if (e.outcome === "done") {
                  return "Finished - no answer after every message";
                }
                if (e.lastError === "taken_over") {
                  return "You're handling this one - Scout is paused here";
                }
                if (e.lastError === "billing_exhausted") {
                  return "Paused until you top up Coins";
                }
                if (e.lastError) {
                  return `Holding · ${REFUSAL_WORDS[e.lastError] ?? humanizeToken(e.lastError)}`;
                }
                if (sent >= total) {
                  return "Waiting on a reply";
                }
                return sent === 0
                  ? "Sending the first message"
                  : `Message ${sent + 1} ${whenDue(e.nextDueAtMs)}`;
              })();
              const tone =
                e.outcome === "booked" && e.bookingCancelled
                  ? "text-ink-3"
                  : isLiveWin(e)
                    ? "text-sage"
                    : e.outcome === "replied"
                      ? "text-sage"
                      : e.lastError === "taken_over"
                        ? "text-sage"
                        : e.lastError
                          ? "text-terracotta-deep"
                          : "text-ink-3";
              const identity = rowIdentity(e.facts);
              return (
                <button
                  key={e.customerId}
                  type="button"
                  onClick={() =>
                    setJourneyFor({
                      phone: e.phoneE164,
                      fallbackName: identity.title,
                      customerId: e.customerId,
                      invoiceRef: flow.segment.source === "overdue_ar" ? e.subjectRef : undefined,
                      breakdown: docsFromFacts(e.facts),
                      money:
                        dollars(stake) > 0
                          ? {
                              amount: dollars(stake),
                              caption: invoice
                                ? `Owed on invoice ${invoice}`
                                : "At stake in this flow",
                            }
                          : undefined,
                      whyNow: next,
                      engagementFacts: e.facts,
                    })
                  }
                  className="ios-sep block w-full px-4 py-3 text-left hover:bg-cream/40"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-body font-medium text-ink">
                      {identity.title}
                    </span>
                    {stake ? (
                      <span className="shrink-0 text-label font-semibold text-ink-2 tabular-nums">
                        {stake}
                      </span>
                    ) : null}
                  </div>

                  {identity.address ? (
                    <div className="mt-0.5 truncate text-label text-ink-3">{identity.address}</div>
                  ) : null}
                  <div className="mt-0.5 flex items-center gap-2 text-label text-ink-3">
                    <span className="flex items-center gap-[3px]">
                      {Array.from({ length: total }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${i < sent ? "bg-sage" : "bg-tan-soft"}`}
                        />
                      ))}
                    </span>
                    <span>
                      {sent} of {total} sent
                    </span>
                    {e.lastSentAtMs ? (
                      <span>&middot; last text {sinceSent(e.lastSentAtMs)}</span>
                    ) : null}
                    {invoice ? <span>&middot; invoice {invoice}</span> : null}
                    {!e.bookingCancelled && dollars(e.facts?.revenue_won) > 0 ? (
                      <span className="text-sage">
                        &middot; won {money(dollars(e.facts?.revenue_won))} after the text
                      </span>
                    ) : null}
                  </div>
                  <div className={`mt-1 text-label ${tone}`}>{next}</div>
                  <EngagementBadge facts={e.facts ?? {}} />
                </button>
              );
            })}
            {filteredEnrollments.length === 0 ? (
              <p className="px-4 py-4 text-body text-ink-3">Nobody is in that state right now.</p>
            ) : null}
          </div>
        </>
      )}

      {journeyFor ? (
        <JourneyDrawer
          phone={journeyFor.phone}
          fallbackName={journeyFor.fallbackName}
          customerId={journeyFor.customerId}
          invoiceRef={journeyFor.invoiceRef}
          money={journeyFor.money}
          whyNow={journeyFor.whyNow}
          engagementFacts={journeyFor.engagementFacts}
          breakdown={journeyFor.breakdown}
          onClose={() => setJourneyFor(null)}
        />
      ) : null}
    </div>
  );
}
