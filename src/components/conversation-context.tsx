"use client";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { handoffReason, type ConversationHandoff } from "@/lib/conversation-status";
import { dashboardLine } from "@/lib/format";
import { safeTimeZone, shopDate } from "@/lib/shop-time";
interface Context {
  phoneE164: string;
  invoiceUnavailable?: boolean;
  invoicePending?: boolean;
  callsUnavailable?: boolean;
  smsUnavailable?: boolean;
  revive?: {
    whyNow: string;
  };
  chases?: Array<{
    flowName: string;
    outcome: string;
  }>;
  events: Array<
    ConversationHandoff & {
      kind: string;
    }
  >;
}
function shortDate(ms: number, timeZone: string | undefined): string {
  return shopDate(
    ms,
    { shop: safeTimeZone(timeZone) },
    { month: "short", day: "numeric" },
    { autoYear: true },
  );
}
export default function ConversationContext({
  phone,
  customerId,
  messages,
  canSend,
  sendBlocked,
  done,
  optedOut,
  optedOutAtMs,
  timezone,
  unavailable,
  scoutBooked,
}: {
  phone: string;
  customerId?: string | null;
  messages: Array<{
    direction: string;
    body: string;
    atMs: number;
  }>;
  canSend?: boolean;
  sendBlocked?: string;
  done?: boolean;
  optedOut?: boolean;
  optedOutAtMs?: number;
  timezone?: string;
  unavailable: boolean;
  scoutBooked?: {
    atMs: number;
    source: string;
  };
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const latestAt = messages.at(-1)?.atMs;
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("scout:handoff-updated", refresh);
    return () => window.removeEventListener("scout:handoff-updated", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || document.visibilityState === "hidden") {
        return;
      }
      pending = true;
      try {
        const query = new URLSearchParams({ phone });
        if (customerId) {
          query.set("customerId", customerId);
        }
        const response = await fetch(`/api/flows/journey?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Context unavailable");
        }
        const data = (await response.json()) as Context;
        if (data.phoneE164 !== phone || !Array.isArray(data.events)) {
          throw new Error("Wrong conversation");
        }
        if (!controller.signal.aborted) {
          setContext(data);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [phone, customerId, latestAt, retry]);
  useEffect(() => {
    if (!context?.invoicePending) {
      return undefined;
    }
    const timer = setTimeout(() => setRetry((value) => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [context]);
  const latest = messages.at(-1);
  const lastCustomer = messages.findLast((message) => message.direction === "inbound");
  const recordedBookings =
    !failed && context?.phoneE164 === phone
      ? (context.chases?.filter((chase) => chase.outcome === "booked") ?? [])
      : [];
  const bookingSummary = recordedBookings.length
    ? customerId
      ? `Booking recorded in the ${recordedBookings.map((chase) => `“${chase.flowName}”`).join(" and ")} campaign history. Check the CRM for the appointment’s current status.`
      : "Booking activity is recorded for this phone number. It may belong to another customer sharing the number. Verify the customer and current appointment in the CRM."
    : undefined;
  const handoff =
    !failed && !context?.smsUnavailable
      ? context?.events.findLast((event) => event.kind === "escalation" && event.state === "open")
      : undefined;
  const summary =
    (handoff ? handoffReason(handoff) : undefined) ?? (scoutBooked ? undefined : bookingSummary);
  const next = unavailable
    ? "Reload the conversation before acting."
    : optedOut
      ? `Opted out - STOP ${typeof optedOutAtMs === "number" ? `on ${shortDate(optedOutAtMs, timezone)}` : "received"}; texting is off until they text back`
      : handoff
        ? "Review the handoff and help the customer."
        : done
          ? "Marked done. New messages will reopen this conversation."
          : !canSend
            ? sendBlocked
            : latest?.direction === "outbound" && lastCustomer && bookingSummary
              ? "Review the appointment in the CRM if changes are needed."
              : undefined;
  const historyIncomplete =
    !failed &&
    Boolean(
      context?.invoicePending ||
      context?.callsUnavailable ||
      context?.smsUnavailable ||
      context?.invoiceUnavailable,
    );
  if (!scoutBooked && !summary && !next && !failed && !historyIncomplete) {
    return null;
  }
  return (
    <section aria-label="This conversation">
      <p className="mb-3 text-caption font-semibold tracking-[0.14em] uppercase text-ink-4">
        This conversation
      </p>
      <div className="space-y-4">
        {scoutBooked ? (
          <p className="flex items-center gap-1.5 text-body font-semibold text-sage-ink">
            <CalendarCheck aria-hidden="true" size={15} strokeWidth={2} className="shrink-0" />
            Scout booked this customer {shortDate(scoutBooked.atMs, timezone)}
          </p>
        ) : null}
        {summary ? (
          <div>
            <h3 className="mb-1.5 text-label font-semibold text-ink-3">Summary</h3>
            <p className="text-body leading-relaxed text-ink">{dashboardLine(summary)}</p>
          </div>
        ) : null}
        {next ? (
          <div>
            <h3 className="mb-1.5 text-label font-semibold text-ink-3">Next step</h3>
            <p className="text-body leading-relaxed text-ink-2">{next}</p>
          </div>
        ) : null}
        {failed ? (
          <div role="status" className="text-label text-ink-3">
            Customer history couldn’t be refreshed.
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-2 flex min-h-11 items-center gap-1.5 font-semibold text-sage-deep"
            >
              <RefreshCw size={14} strokeWidth={1.8} />
              Retry context
            </button>
          </div>
        ) : !context ? (
          <p role="status" className="text-label text-ink-3">
            Loading customer history…
          </p>
        ) : context.callsUnavailable || context.smsUnavailable || context.invoiceUnavailable ? (
          <p role="status" className="text-label text-ink-3">
            Some customer history is unavailable.
          </p>
        ) : context.invoicePending ? (
          <p role="status" className="text-label text-ink-3">
            Some customer history is still loading.
          </p>
        ) : null}
      </div>
    </section>
  );
}
