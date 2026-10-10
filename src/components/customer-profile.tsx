"use client";
import {
  ArrowUpRight,
  Check,
  FileText,
  MessageSquare,
  Phone,
  PhoneOutgoing,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import ConversationHandoffCard from "@/components/conversation-handoff";
import { CrmCustomerLink, useCrmName } from "@/components/crm-link";
import { EngagementExplanation } from "@/components/engagement-priority";
import { useShopClock } from "@/components/shop-clock";
import { useAppUpdateHold } from "@/lib/app-update";
import { handoffReason, replyOwnership } from "@/lib/conversation-status";
import { inboxSurface } from "@/lib/inbox-surface";
import { humanizeToken, sentenceCase } from "@/lib/pro-case";
import { safeTimeZone, shopDate, shopDayKey, shopStamp, type ShopClock } from "@/lib/shop-time";
interface JourneyEvent {
  id?: string;
  kind: "sms" | "call" | "escalation";
  atMs: number;
  direction?: string;
  body?: string;
  sendClass?: string;
  durationSec?: number;
  outcome?: string;
  status?: string;
  reason?: string;
  headline?: string;
  state?: string;
}
interface Journey {
  customerId?: string;
  invoice?: {
    id: string;
    invoiceNumber?: string;
    status?: string;
    total?: number;
    balance?: number;
    date?: string;
    dueDate?: string;
    paidAt?: string;
    url?: string | null;
  } | null;
  invoiceUnavailable?: boolean;
  phoneE164: string;
  name: string | null;
  takenOver: boolean;
  canSend: boolean;
  sendBlocked?: {
    code: string;
    reason: string;
  };
  events: JourneyEvent[];
  optedOut?: boolean;
  optedOutAtMs?: number;
  timezone?: string;
  smsUnavailable?: boolean;
  callsUnavailable?: boolean;
  revive?: {
    scoreBadge: string;
    whyNow: string;
    factors: Array<{
      label: string;
      value: string;
    }>;
    finalScore: string;
    breakdown: {
      title: string;
      items: BreakdownItem[];
    };
  };
  chases?: Array<{
    flowId: string;
    flowName: string;
    flowState: string;
    outcome: string;
    touchesSent: number;
    maxTouches?: number;
    people?: number;
    customerName?: string;
  }>;
  sharedPhone?: {
    customers: number;
    names?: string[];
  };
}
function duration(sec?: number): string | null {
  if (!sec || sec <= 0) {
    return null;
  }
  const mins = Math.floor(sec / 60);
  const rest = sec % 60;
  return mins > 0 ? `${mins}m ${rest}s` : `${rest}s`;
}
const CALL_OUTCOMES: Record<string, string> = {
  booked: "Booked a job",
  escalated: "Handed to you",
  answered: "Answered",
  unresolved: "Left unresolved",
  spam: "Spam",
  "dead-air": "Dead air",
  "no-connect": "Didn't connect",
};
const MONEY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const RECENT_CHAT_TAIL = 5;
export function initials(name: string | null): string {
  if (!name) {
    return "?";
  }
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
export interface BreakdownItem {
  title: string;
  amount?: number;
  status?: string;
  meta?: string;
}
const DEV_PROFILE =
  process.env.NODE_ENV === "development"
    ? {
        scoreBadge: "Revive score 89",
        breakdown: {
          title: "Estimate breakdown",
          items: [
            {
              title: "Property improvement project - materials, labor & permit (sample)",
              amount: 11850,
              status: "Presented",
              meta: "#E-10401 · 34d ago · Miguel Torres",
            },
          ],
        },
        factors: [
          { label: "Open estimate on file", value: "+55" },
          { label: "Gone cold (34 days) - needs a nudge", value: "+15" },
          { label: "Job size ($11,850)", value: "+12" },
          { label: "Talked to us this season", value: "+7" },
        ],
        finalScore: "89 / 100",
      }
    : null;
export function JourneyDrawer({
  phone,
  fallbackName,
  customerId,
  invoiceRef,
  money,
  whyNow,
  engagementFacts,
  scoreBadge,
  breakdown,
  factors,
  finalScore,
  asPane,
  context,
  surface,
  refreshKey,
  onClose,
}: {
  phone: string;
  fallbackName: string | null;
  customerId?: string | null;
  invoiceRef?: string;
  money?: {
    amount: number;
    caption: string;
    kind?: "collected" | "won";
  };
  whyNow?: string;
  engagementFacts?: Record<string, string>;
  scoreBadge?: string;
  breakdown?: {
    title: string;
    items: BreakdownItem[];
  };
  factors?: Array<{
    label: string;
    value: string;
  }>;
  finalScore?: string;
  asPane?: boolean;
  context?: ReactNode;
  surface?: "messages";
  refreshKey?: string | number;
  onClose?: () => void;
}) {
  const { displayPhone: formatPhone, displayText } = useCampaignPhonePrivacy();
  const [journey, setJourney] = useState<Journey | null>(null);
  const titleId = useId();
  const shopClock = useShopClock();
  const crmName = useCrmName();
  const clock: ShopClock = {
    ...shopClock,
    shop: shopClock.shop ?? safeTimeZone(journey?.timezone),
  };
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  useAppUpdateHold(sending || draft.trim() !== "");
  const [sendError, setSendError] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [showAllChat, setShowAllChat] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asPane) {
      return undefined;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      const dialog = dialogRef.current;
      const controls = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), summary, [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      const inside = dialog?.contains(document.activeElement);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog || !inside)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keepFocus);
    return () => {
      document.removeEventListener("keydown", keepFocus);
      previousFocus?.focus();
    };
  }, [asPane]);
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = (loadSeq.current += 1);
    try {
      const res = await fetch(
        `/api/flows/journey?phone=${encodeURIComponent(phone)}${customerId ? `&customerId=${encodeURIComponent(customerId)}` : ""}${invoiceRef ? `&invoiceRef=${encodeURIComponent(invoiceRef)}` : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        if (seq === loadSeq.current) {
          setFailed(true);
        }
        return;
      }
      const data = (await res.json()) as Journey;
      if (seq !== loadSeq.current) {
        return;
      }
      setJourney(data);
      setFailed(false);
    } catch {
      if (seq === loadSeq.current) {
        setFailed(true);
      }
    }
  }, [phone, customerId, invoiceRef]);
  useEffect(() => {
    setJourney(null);
    setFailed(false);
    setShowAllChat(false);
    void load();
  }, [load]);
  const seenRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (seenRefreshKey.current === refreshKey) {
      return;
    }
    seenRefreshKey.current = refreshKey;
    void load();
  }, [refreshKey, load]);
  useEffect(() => {
    if (asPane || !onClose) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        return;
      }
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asPane, onClose]);
  const sendText = async () => {
    if (!draft.trim() || sending) {
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, body: draft.trim(), surface: inboxSurface("customer") }),
      });
      if (res.ok) {
        setDraft("");
        await load();
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        setSendError(body.error ?? "The text could not be sent.");
        if (body.code) {
          await load();
        }
      }
    } catch {
      setSendError("The text could not be sent.");
    } finally {
      setSending(false);
    }
  };
  const takeOver = async () => {
    setResumeError(null);
    try {
      const res = await fetch("/api/inbox/takeover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, surface: inboxSurface("customer") }),
      });
      if (res.ok) {
        await load();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setResumeError(body.error ?? "Scout could not be paused on this thread.");
    } catch {
      setResumeError("Scout could not be paused on this thread.");
    }
  };
  const resumeScout = async () => {
    setResumeError(null);
    try {
      const res = await fetch("/api/inbox/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, surface: inboxSurface("customer") }),
      });
      if (res.ok) {
        await load();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setResumeError(body.error ?? "Scout could not be resumed on this thread.");
    } catch {
      setResumeError("Scout could not be resumed on this thread.");
    }
  };
  const name = customerId && fallbackName ? fallbackName : (journey?.name ?? fallbackName);
  const invoice = journey?.invoice;
  const settled = invoice?.balance === 0;
  const badge = settled
    ? undefined
    : (scoreBadge ?? journey?.revive?.scoreBadge ?? DEV_PROFILE?.scoreBadge);
  const estimateItems = (journey?.revive?.breakdown?.items ?? []).filter(
    (item) => typeof item.amount === "number",
  );
  const heroMoney =
    (money?.kind
      ? money
      : invoice && typeof invoice.balance === "number"
        ? {
            amount: invoice.balance,
            caption: settled
              ? invoice?.status === "paid"
                ? "Invoice paid · nothing due"
                : "No balance due"
              : "Current balance due",
          }
        : invoiceRef
          ? undefined
          : money) ??
    (!invoiceRef && estimateItems.length > 0
      ? {
          amount: estimateItems.reduce((sum, item) => sum + (item.amount ?? 0), 0),
          caption: `Open estimate · ${estimateItems.length} estimate${estimateItems.length === 1 ? "" : "s"}`,
        }
      : undefined);
  const docs:
    | {
        title: string;
        items: BreakdownItem[];
      }
    | undefined = invoice
    ? {
        title: `Invoice ${invoice.invoiceNumber ?? invoice.id}`,
        items: [
          {
            title: "Invoice total",
            amount: invoice.total,
            status: invoice.status,
            meta: invoice.date ? `Issued ${invoice.date.slice(0, 10)}` : "",
          },
          {
            title: "Balance due",
            amount: invoice.balance,
            meta: invoice.paidAt
              ? `Paid ${/^\d{4}-\d{2}-\d{2}$/.test(invoice.paidAt) ? invoice.paidAt : shopDayKey(Date.parse(invoice.paidAt), clock)}`
              : "",
          },
        ],
      }
    : invoiceRef
      ? undefined
      : (journey?.revive?.breakdown ?? breakdown ?? DEV_PROFILE?.breakdown);
  const scoreRows = settled
    ? undefined
    : (factors ?? journey?.revive?.factors ?? DEV_PROFILE?.factors);
  const scoreTotal = settled
    ? undefined
    : (finalScore ?? journey?.revive?.finalScore ?? DEV_PROFILE?.finalScore);
  const whyNowShown = settled
    ? undefined
    : (journey?.revive?.whyNow ?? (invoiceRef ? undefined : whyNow));
  const brief = surface === "messages";
  const pastHandoffs = brief
    ? (journey?.events ?? []).filter((e) => e.kind === "escalation" && e.state !== "open")
    : [];
  const docsSection =
    docs && docs.items.length > 0 ? (
      <section aria-label={docs.title}>
        <p className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
          <FileText size={11} />
          {docs.title}
        </p>
        <div className="flex flex-col gap-2.5">
          {invoice?.url ? (
            <a
              href={invoice.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-label text-sage-deep underline"
            >
              Open invoice
            </a>
          ) : null}
          {docs.items.map((item, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-body font-medium text-ink">{item.title}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {typeof item.amount === "number" ? (
                    <span className="font-tabular text-body font-semibold text-ink">
                      {MONEY_FMT.format(item.amount)}
                    </span>
                  ) : null}
                  {item.status ? (
                    <span className="text-micro font-bold tracking-wide uppercase text-sage-deep">
                      {item.status}
                    </span>
                  ) : null}
                </span>
              </div>
              {item.meta ? <div className="mt-0.5 text-label text-ink-3">{item.meta}</div> : null}
            </div>
          ))}
        </div>
      </section>
    ) : null;
  const scoreTable =
    scoreRows && scoreRows.length > 0 ? (
      <>
        {scoreRows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-body text-ink-2">{row.label}</span>
            <span className="font-tabular text-body text-ink-2">{row.value}</span>
          </div>
        ))}
        {scoreTotal ? (
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-tan-soft pt-2">
            <span className="text-body font-semibold text-ink">
              {(badge ?? "").startsWith("Collect") ? "Final collect score" : "Final revive score"}
            </span>
            <span className="font-tabular text-body font-semibold text-ink">{scoreTotal}</span>
          </div>
        ) : null}
      </>
    ) : null;
  return (
    <div
      className={
        asPane
          ? "h-full"
          : "fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4"
      }
      onClick={asPane ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={asPane ? undefined : -1}
        role={asPane ? undefined : "dialog"}
        data-customer-profile=""
        aria-modal={asPane ? undefined : "true"}
        aria-labelledby={titleId}
        className={
          asPane
            ? "flex h-full max-h-[calc(100vh-9rem)] w-full flex-col overflow-hidden rounded-2xl border border-tan-soft bg-paper shadow-soft"
            : "quiet-focus flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-paper shadow-lg sm:rounded-3xl"
        }
        onClick={asPane ? undefined : (e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-tan-soft px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta-tint text-body font-bold text-terracotta-deep">
            {initials(name) === "?" ? <Phone size={16} strokeWidth={2} /> : initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <div id={titleId} className="truncate text-body-lg font-semibold text-ink">
              {displayText(name ?? formatPhone(phone))}
            </div>
            <div className="flex items-center gap-2 truncate text-label text-ink-3">
              {name ? <span>{formatPhone(phone)}</span> : null}
            </div>
          </div>
          {asPane ? null : (
            <button type="button" onClick={onClose} className="secondary-control">
              Close
            </button>
          )}
          <div className="w-full empty:hidden">
            <CrmCustomerLink customerId={customerId || journey?.customerId} />
          </div>
        </div>

        <div className="flex min-h-[200px] flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {context ? (
            <div data-profile-slot="context" className="border-b border-tan-soft pb-4 empty:hidden">
              {context}
            </div>
          ) : null}
          {failed ? (
            <div className="text-body text-ink-3">
              The history couldn&apos;t be loaded right now.
            </div>
          ) : journey === null ? (
            <div className="text-body text-ink-3">Pulling their history&hellip;</div>
          ) : (
            <>
              {journey.invoiceUnavailable ? (
                <p role="status" className="text-body text-ink-3">
                  The current invoice could not be loaded.{" "}
                  <button type="button" onClick={() => void load()} className="underline">
                    Retry
                  </button>
                </p>
              ) : null}

              {!heroMoney && badge ? (
                <div className="flex justify-end">
                  <span className="rounded-pill border border-tan-soft bg-paper px-3 py-1 text-label font-semibold text-ink-2">
                    {badge}
                  </span>
                </div>
              ) : null}
              {heroMoney ? (
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-cream/70 px-4 py-3.5">
                  <div>
                    <div className="font-tabular text-[1.9rem] leading-tight font-semibold text-ink">
                      {MONEY_FMT.format(heroMoney.amount)}
                    </div>
                    <div className="mt-0.5 text-label text-ink-3">{heroMoney.caption}</div>
                  </div>
                  {badge ? (
                    <span className="mt-1 shrink-0 rounded-pill border border-tan-soft bg-paper px-3 py-1 text-label font-semibold text-ink-2">
                      {badge}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {brief ? null : docsSection}

              {engagementFacts ? <EngagementExplanation facts={engagementFacts} /> : null}
              {whyNowShown || (!brief && scoreTable) ? (
                <section aria-label="Why now">
                  <p className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
                    <Sparkles size={11} className="text-terracotta" />
                    {!brief && scoreTable ? "Why now & score" : "Why now"}
                  </p>
                  <div className="rounded-2xl bg-cream/70 px-4 py-3">
                    {whyNowShown ? (
                      <div className="text-body font-medium text-ink">{whyNowShown}</div>
                    ) : null}
                    {!brief && scoreTable ? (
                      <div className={whyNowShown ? "mt-2.5" : ""}>{scoreTable}</div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {brief && (docsSection || scoreTable || pastHandoffs.length > 0) ? (
                <details className="rounded-2xl bg-paper-2 px-4 py-3">
                  <summary className="cursor-pointer text-label font-semibold text-ink-2 hover:text-ink">
                    Details
                  </summary>
                  <div className="mt-3 flex flex-col gap-4">
                    {docsSection}
                    {scoreTable ? <div>{scoreTable}</div> : null}
                    {pastHandoffs.length > 0 ? (
                      <section aria-label="Past hand-offs">
                        <p className="mb-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
                          Past hand-offs
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {pastHandoffs.map((event, i) => (
                            <div
                              key={event.id ?? `past-${event.atMs}-${i}`}
                              className="flex flex-wrap items-baseline justify-between gap-x-2"
                            >
                              <span className="min-w-0 text-body text-ink-2">
                                {displayText(handoffReason(event))}
                                <span className="ml-1.5 text-label whitespace-nowrap text-ink-3">
                                  ·{" "}
                                  {event.state === "dismissed" || event.state === "resolved"
                                    ? "Handled"
                                    : humanizeToken(event.state ?? "closed")}
                                </span>
                              </span>
                              <span className="shrink-0 text-[10px] text-ink-3">
                                {shopStamp(event.atMs, clock)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {journey.callsUnavailable ? (
                <div className="rounded-2xl bg-golden-tint px-3.5 py-2 text-label text-ink">
                  Call history couldn&apos;t be loaded - texts shown may not be the whole story.
                </div>
              ) : null}
              {journey.smsUnavailable ? (
                <div className="rounded-2xl bg-golden-tint px-3.5 py-2 text-label text-ink">
                  Text history couldn&apos;t be loaded - calls shown may not be the whole story.
                </div>
              ) : null}

              {journey.chases && journey.chases.length > 0 ? (
                <section aria-label="Worked by">
                  <p className="mb-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
                    Worked by
                  </p>
                  {journey.sharedPhone ? (
                    <p className="mb-2 text-label leading-relaxed text-ink-2">
                      Shared number: {journey.sharedPhone.customers} customers&apos; campaigns text
                      it, so a reply here may be from either.
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    {journey.chases.map((c) => {
                      const status =
                        c.outcome === "active"
                          ? c.flowState === "live"
                            ? `Working · text ${Math.min(c.touchesSent + 1, c.maxTouches ?? c.touchesSent + 1)} of ${c.maxTouches ?? "?"}`
                            : humanizeToken(c.flowState)
                          : c.outcome === "paid"
                            ? "Finished · they paid"
                            : c.outcome === "booked"
                              ? "Finished · they booked"
                              : c.outcome === "booking_cancelled"
                                ? "Finished · booking cancelled"
                                : c.outcome === "replied"
                                  ? "Stopped · they replied, Scout took the conversation"
                                  : c.outcome === "opted_out"
                                    ? "Stopped · they opted out"
                                    : humanizeToken(c.outcome);
                      return (
                        <a
                          key={c.flowId}
                          href={`/flows/${encodeURIComponent(c.flowId)}`}
                          className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-xl border border-tan-soft bg-paper-2 px-3 py-2 hover:border-sage/40"
                        >
                          <span className="min-w-0 truncate text-body font-medium text-ink">
                            {c.flowName}
                            {c.people && c.people > 1 ? (
                              <span className="ml-1.5 text-label font-normal text-ink-3">
                                · {c.people} people
                              </span>
                            ) : c.customerName ? (
                              <span className="ml-1.5 text-label font-normal text-ink-3">
                                · {displayText(c.customerName)}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className="min-w-0 text-label text-ink-3"
                            title={
                              c.outcome === "booking_cancelled"
                                ? `Booked, then cancelled in ${crmName}`
                                : undefined
                            }
                          >
                            {status}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {(() => {
                const smsEvents = journey.events.filter((e) => e.kind === "sms");
                const others = journey.events.filter((e) =>
                  brief ? e.kind === "call" : e.kind !== "sms",
                );
                const tail = showAllChat ? smsEvents : smsEvents.slice(-RECENT_CHAT_TAIL);
                const hidden = smsEvents.length - tail.length;
                return (
                  <>
                    {brief ? null : (
                      <section aria-label="Recent chat">
                        <p className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
                          <MessageSquare size={11} />
                          Recent chat
                        </p>
                        {smsEvents.length === 0 ? (
                          <div className="text-body text-ink-3">No texts with this number yet.</div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {hidden > 0 ? (
                              <button
                                type="button"
                                onClick={() => setShowAllChat(true)}
                                className="flex items-center gap-1.5 self-center py-1 text-label font-semibold text-ink-2 transition-colors hover:text-ink"
                              >
                                <ArrowUpRight size={13} />
                                Open full chat history ({smsEvents.length})
                              </button>
                            ) : null}
                            {tail.map((event, i) => {
                              const inbound = event.direction === "inbound";
                              const speaker = inbound
                                ? ""
                                : event.sendClass === "owner"
                                  ? "You · "
                                  : "Scout · ";
                              return (
                                <div
                                  key={`sms-${event.atMs}-${i}`}
                                  className={`flex flex-col ${inbound ? "items-start" : "items-end"}`}
                                >
                                  <div
                                    className={`max-w-[82%] text-body break-words ${
                                      inbound
                                        ? "py-0.5 text-ink"
                                        : "rounded-2xl bg-sage-tint/70 px-3.5 py-2 text-ink"
                                    }`}
                                  >
                                    {displayText(event.body ?? "")}
                                  </div>
                                  <span className="mt-0.5 px-1 text-[10px] text-ink-3">
                                    {speaker}
                                    {shopStamp(event.atMs, clock)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}

                    {others.length > 0 ? (
                      <section aria-label={brief ? "Calls" : "Calls and hand-offs"}>
                        <p className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
                          <Phone size={11} />
                          {brief ? "Calls" : <>Calls &amp; hand-offs</>}
                        </p>
                        <div className="flex flex-col gap-2">
                          {others.map((event, i) => {
                            if (event.kind === "call") {
                              const inbound = event.direction === "inbound";
                              const bits = [
                                duration(event.durationSec),
                                event.outcome
                                  ? (CALL_OUTCOMES[event.outcome] ?? humanizeToken(event.outcome))
                                  : null,
                              ].filter(Boolean);
                              return (
                                <div
                                  key={`call-${event.atMs}-${i}`}
                                  className="flex items-center gap-2.5 rounded-2xl border border-tan-soft bg-cream/40 px-3.5 py-2"
                                >
                                  {inbound ? (
                                    <Phone size={14} className="shrink-0 text-sage" />
                                  ) : (
                                    <PhoneOutgoing size={14} className="shrink-0 text-sage" />
                                  )}
                                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
                                    <span className="min-w-0 text-body text-ink">
                                      {inbound ? "They called" : "Scout called them"}
                                      {bits.length > 0 ? (
                                        <span className="text-ink-3">
                                          {" "}
                                          &middot; {bits.join(" · ")}
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-ink-3">
                                      {shopStamp(event.atMs, clock)}
                                    </span>
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div key={event.id ?? `esc-${event.atMs}-${event.reason ?? i}`}>
                                <p className="mb-1 text-caption text-ink-3">
                                  {shopStamp(event.atMs, clock)}
                                </p>
                                <ConversationHandoffCard event={event} onHandled={load} />
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ) : null}
                  </>
                );
              })()}

              {brief ? null : (
                <section aria-label="Jump to">
                  <p className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
                    <ArrowUpRight size={11} />
                    Jump to
                  </p>
                  <div className="flex gap-8">
                    {asPane ? null : (
                      <a
                        href={`/inbox?phone=${encodeURIComponent(phone)}`}
                        className="flex items-center gap-2 text-body font-medium text-ink-2 transition-colors hover:text-ink"
                      >
                        <MessageSquare size={15} />
                        Chat history
                      </a>
                    )}
                    <a
                      href="/calls"
                      className="flex items-center gap-2 text-body font-medium text-ink-2 transition-colors hover:text-ink"
                    >
                      <Phone size={15} />
                      Calls
                    </a>
                  </div>
                </section>
              )}

              {!brief && journey.canSend && !journey.optedOut ? (
                <div className="flex items-center gap-1.5 text-label text-sage-deep">
                  <Check size={13} />
                  OK to text
                </div>
              ) : null}
            </>
          )}
        </div>

        {asPane || brief ? null : (
          <>
            {journey?.takenOver ? (
              <div className="flex items-center justify-between gap-3 border-t border-tan-soft px-5 py-2.5">
                <span className="text-label text-ink-2">
                  {replyOwnership({ takenOver: true })}
                  {resumeError ? (
                    <span className="mt-0.5 block text-alarm">{resumeError}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => void resumeScout()}
                  className="shrink-0 rounded-pill bg-sage px-3 py-1.5 text-label font-semibold text-paper"
                >
                  Let Scout continue
                </button>
              </div>
            ) : null}

            {journey &&
            !journey.takenOver &&
            (journey.canSend || journey.sendBlocked) &&
            !journey.optedOut ? (
              <div className="flex items-center justify-between gap-3 border-t border-tan-soft bg-paper-2 px-5 py-2.5">
                <span className="text-label text-ink-2">
                  {replyOwnership({ takenOver: false })}
                  {resumeError ? (
                    <span className="mt-0.5 block text-alarm">{resumeError}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => void takeOver()}
                  className="shrink-0 rounded-pill border border-tan-soft bg-paper px-3 py-1.5 text-label font-semibold text-ink-2 hover:text-ink"
                >
                  I&apos;ll take this one
                </button>
              </div>
            ) : null}

            {journey?.optedOut ? (
              <div className="border-t border-tan-soft bg-paper-2 px-5 py-3 text-label text-ink-2">
                They opted out of texts
                {journey.optedOutAtMs
                  ? ` (STOP on ${shopDate(journey.optedOutAtMs, clock, { month: "short", day: "numeric", year: "numeric" })})`
                  : ""}
                , so this thread can&apos;t be texted. Give them a call instead.
              </div>
            ) : journey?.sendBlocked && !journey.canSend ? (
              <div
                role="status"
                aria-label="Texting"
                data-send-blocked={journey.sendBlocked.code}
                className="border-t border-tan-soft bg-paper-2 px-5 py-3 text-label text-ink-2"
              >
                {journey.sendBlocked.reason}
              </div>
            ) : journey?.canSend ? (
              <div className="border-t border-tan-soft px-4 py-3">
                {sendError ? (
                  <div className="mb-1.5 text-label text-alarm">{sentenceCase(sendError)}</div>
                ) : null}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendText();
                  }}
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      journey.takenOver
                        ? "Reply as yourself…"
                        : "Send a text - Scout will pause while you take over…"
                    }
                    disabled={sending}
                    className="flex-1 rounded-2xl border border-tan-soft bg-paper px-4 py-2.5 text-body text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="rounded-2xl bg-sage px-5 py-2.5 text-body font-semibold text-paper disabled:opacity-50"
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </form>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
