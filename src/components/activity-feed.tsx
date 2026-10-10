"use client";
import { MessageSquare, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { useShopClock } from "@/components/shop-clock";
import { formatPhone } from "@/lib/format";
import { shopDate, type ShopClock } from "@/lib/shop-time";
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
function ago(atMs: number, clock: ShopClock): string {
  const ms = Date.now() - atMs;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return shopDate(atMs, clock, { month: "short", day: "numeric" });
}
export function headline(e: ActivityEvent): string {
  const who = e.name ?? formatPhone(e.phoneE164);
  if (e.kind === "paid") {
    return `${who} paid${typeof e.amount === "number" ? ` $${Math.round(e.amount).toLocaleString("en-US")}` : ""}`;
  }
  if (e.channel === "voice") {
    return e.direction === "inbound" ? `${who} called` : `Scout called ${who}`;
  }
  if (e.direction === "inbound") {
    return `${who} replied`;
  }
  if (e.sendClass === "owner") {
    return `You texted ${who}`;
  }
  if (e.sendClass === "customer-reply") {
    return `Scout texted ${who} back`;
  }
  return `Scout texted ${who}`;
}
export function ActivityFeed() {
  const clock = useShopClock();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/activity?limit=25", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          events?: ActivityEvent[];
        };
        if (!cancelled && Array.isArray(body.events)) setEvents(body.events);
      } catch {}
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  if (!events || events.length === 0) {
    return null;
  }
  return (
    <div className="animate-fadeIn mx-auto mt-8 w-full max-w-xl text-left">
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-sage" />
        </span>
        <span className="text-label font-bold tracking-[0.12em] uppercase text-ink-3">
          Happening now
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-2xl border border-tan-soft bg-paper shadow-soft">
        {events.map((e, i) => {
          const money = e.kind === "paid";
          const inner = (
            <>
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${money ? "bg-sage text-paper" : "bg-sage-tint text-sage"}`}
              >
                {money ? (
                  "$"
                ) : e.channel === "voice" ? (
                  <Phone size={12} />
                ) : (
                  <MessageSquare size={12} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-body ${money ? "font-semibold text-sage-deep" : "font-medium text-ink"}`}
                >
                  {headline(e)}
                </span>
                {money ? (
                  e.flowName ? (
                    <span className="block truncate text-label text-ink-3">
                      through &ldquo;{e.flowName}&rdquo;
                    </span>
                  ) : null
                ) : e.body ? (
                  <span className="block truncate text-label italic text-ink-3">
                    &ldquo;{e.body}&rdquo;
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
                {ago(e.atMs, clock)}
              </span>
            </>
          );
          const row = "ios-sep flex w-full items-start gap-2.5 px-3.5 py-2 text-left";
          return e.channel === "sms" && !money ? (
            <a
              key={`${e.atMs}-${i}`}
              href={`/inbox?phone=${encodeURIComponent(e.phoneE164)}`}
              className={`${row} hover:bg-cream/40`}
            >
              {inner}
            </a>
          ) : e.channel === "voice" ? (
            <a key={`${e.atMs}-${i}`} href="/calls" className={`${row} hover:bg-cream/40`}>
              {inner}
            </a>
          ) : (
            <div key={`${e.atMs}-${i}`} className={row}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
