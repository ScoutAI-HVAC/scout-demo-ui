"use client";
import { ArrowRight, Banknote, CircleDollarSign, MessageSquare, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { ScoutImpact, ValueChannel } from "@/lib/scout-impact";
import { useScoutImpact } from "@/lib/use-scout-impact";
const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
export function compactMoney(value: number) {
  if (value < 1000) return money(value);
  const [unit, size] = value < 1e6 ? (["k", 1e3] as const) : (["M", 1e6] as const);
  const tenths = Math.floor(value / (size / 10));
  const short =
    tenths >= 1000 ? String(Math.floor(tenths / 10)) : (tenths / 10).toFixed(1).replace(/\.0$/, "");
  return `$${short}${unit}`;
}
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
function statusSplit(impact: ScoutImpact) {
  const total = Math.round(impact.total * 100);
  const collected = Math.round(impact.recovered * 100);
  const estimated = Math.round(impact.estimated * 100);
  return {
    collected: collected / 100,
    billed: Math.max(0, total - collected - estimated) / 100,
    estimated: estimated / 100,
  };
}
function ValueBar({ impact, className }: { impact: ScoutImpact; className: string }) {
  const split = statusSplit(impact);
  if (impact.total <= 0) {
    return <div aria-hidden className={`rounded-full bg-ink/8 ${className}`} />;
  }
  return (
    <div aria-hidden className={`flex gap-0.5 overflow-hidden rounded-full ${className}`}>
      {(
        [
          ["bg-sage", split.collected],
          ["bg-sage-soft", split.billed],
          ["value-est", split.estimated],
        ] as const
      ).map(([fill, value]) =>
        value > 0 ? (
          <span key={fill} className={`h-full ${fill}`} style={{ flexGrow: value }} />
        ) : null,
      )}
    </div>
  );
}
export default function ScoutValueChip({
  placement,
}: {
  placement: "rail" | "rail-collapsed" | "strip";
}) {
  const { impact, failed } = useScoutImpact();
  const [open, setOpen] = useState(false);
  const label = impact
    ? `Scout value ${money(impact.total)}`
    : failed
      ? "Scout value unavailable"
      : "Scout value loading";
  const common = {
    type: "button" as const,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    onClick: () => setOpen(true),
  };
  const unpricedZero =
    impact && impact.total === 0 && impact.unpricedBookings ? impact.unpricedBookings : 0;
  const chip =
    placement === "rail" ? (
      <button
        {...common}
        aria-label={label}
        className="mx-4 mb-4 rounded-2xl bg-paper px-4 pt-3 pb-3.5 text-left transition-colors hover:bg-cream"
      >
        <span className="block text-body font-medium text-ink-2">Scout value</span>
        <span className="mt-0.5 block text-h1 font-semibold tracking-tight text-ink tabular-nums">
          {impact ? money(impact.total) : "—"}
        </span>
        {impact ? <ValueBar impact={impact} className="mt-2.5 h-1.5" /> : null}
        <span className="mt-2 block truncate text-body text-ink-2">
          {!impact
            ? failed
              ? "Couldn't read value"
              : "Reading the books…"
            : unpricedZero
              ? `${plural(unpricedZero, "booking", "bookings")} not priced yet`
              : `${money(impact.recovered)} collected`}
        </span>
      </button>
    ) : placement === "rail-collapsed" ? (
      <button
        {...common}
        aria-label={label}
        title={label}
        className="mx-auto mb-4 flex h-11 min-w-11 items-center justify-center rounded-2xl bg-paper px-1.5 text-label font-semibold text-ink tabular-nums transition-colors hover:bg-cream"
      >
        {impact ? compactMoney(impact.total) : "—"}
      </button>
    ) : (
      <button
        {...common}
        aria-label={label}
        className="flex h-11 items-center gap-2 rounded-full bg-ink/5 pr-4 pl-3.5 text-body-lg font-semibold text-ink tabular-nums transition-colors active:bg-ink/10"
      >
        <span aria-hidden className={`size-2 rounded-full ${impact ? "bg-sage" : "bg-ink-4"}`} />
        {impact ? compactMoney(impact.total) : "—"}
      </button>
    );
  return (
    <>
      {chip}
      {open ? (
        <ScoutValueSheet impact={impact} failed={failed} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
const CHANNELS: Array<{
  key: ValueChannel;
  label: string;
  icon: typeof Phone;
}> = [
  { key: "voice", label: "Phone", icon: Phone },
  { key: "campaign", label: "Campaigns", icon: Banknote },
  { key: "chat", label: "Texts & leads", icon: MessageSquare },
  { key: "other", label: "Other Scout bookings", icon: CircleDollarSign },
];
export function valueNotes(impact: ScoutImpact, failed: boolean) {
  const notes: string[] = [];
  if (failed) notes.push("Couldn't refresh just now. Showing the last verified read.");
  const unpriced = impact.unpricedBookings ?? 0;
  if (unpriced > 0 && impact.total > 0) {
    notes.push(
      `${plural(unpriced, "booking has", "bookings have")} no price yet and ${unpriced === 1 ? "counts" : "count"} as $0.`,
    );
  }
  const checking = impact.pendingBookings + (impact.unreadBookings ?? 0);
  if (checking > 0) {
    notes.push(`${plural(checking, "booking is", "bookings are")} being re-checked with your CRM.`);
  }
  const sourceMissing = Object.values(impact.sources ?? {}).some((read) => read === false);
  if (
    sourceMissing ||
    impact.unverifiedRows > (impact.afterOutreachRows ?? 0) ||
    (impact.partial && !unpriced && !checking && !impact.afterOutreachRows)
  ) {
    notes.push(
      "Some records couldn't be read or verified, so this is the value Scout can confirm.",
    );
  }
  if (impact.afterOutreach) {
    notes.push(
      `Also paid after Scout's texts: ${money(impact.afterOutreach)}. Not in the total, since the office may have booked that work.`,
    );
  }
  return notes;
}
function ScoutValueSheet({
  impact,
  failed,
  onClose,
}: {
  impact: ScoutImpact | null;
  failed: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{
    y: number;
    dy: number;
  } | null>(null);
  const titleId = useId();
  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    sheet.showModal();
    sheet.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  const close = () => dialog.current?.close();
  const split = impact ? statusSplit(impact) : null;
  const unpricedZero =
    impact && impact.total === 0 && impact.unpricedBookings ? impact.unpricedBookings : 0;
  const notes = impact ? valueNotes(impact, failed) : [];
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
      onTouchStart={(event) => {
        if ((dialog.current?.scrollTop ?? 1) <= 0) {
          drag.current = { y: event.touches[0].clientY, dy: 0 };
        }
      }}
      onTouchMove={(event) => {
        const pull = drag.current;
        if (!pull || !dialog.current) return;
        pull.dy = Math.max(0, event.touches[0].clientY - pull.y);
        dialog.current.style.transition = "none";
        dialog.current.style.transform = pull.dy ? `translateY(${pull.dy}px)` : "";
      }}
      onTouchEnd={() => {
        const pull = drag.current;
        drag.current = null;
        if (!pull || !dialog.current) return;
        dialog.current.style.transition = "";
        if (pull.dy > 96) close();
        else dialog.current.style.transform = "";
      }}
      className="value-sheet quiet-focus m-0 mt-auto max-h-[calc(100dvh-var(--safe-t)-0.75rem)] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[28px] bg-cream p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-h-[min(90dvh,52rem)] sm:w-[440px] sm:rounded-[28px]"
    >
      <div className="px-5 pt-2.5 pb-[calc(1.25rem+var(--safe-b))] sm:px-6 sm:pt-6 sm:pb-6">
        <div aria-hidden className="ios-sheet-grabber mb-4 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-body-lg font-medium text-ink-2">
              Scout value · all time
            </h2>
            <p className="mt-1 text-[2.5rem] leading-none font-semibold tracking-tight text-ink tabular-nums">
              {impact ? money(impact.total) : "—"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="chrome-button -mt-1 -mr-1.5 flex shrink-0 items-center justify-center text-ink-2 hover:text-ink"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
        <p className="mt-3 text-body-lg text-ink-2">
          {!impact
            ? failed
              ? "Scout couldn't read its records just now. No total is being guessed."
              : "Reading the records behind the number…"
            : unpricedZero
              ? `${plural(unpricedZero, "booking Scout made has", "bookings Scout made have")} no price in your CRM yet, so ${unpricedZero === 1 ? "it counts" : "they count"} as $0 here.`
              : impact.total === 0 && !impact.trackedBookings
                ? "Nothing yet. Value shows here once Scout books or collects work."
                : "Money and booked work from calls, campaigns and texts Scout handled."}
        </p>

        {impact && split ? (
          <>
            <ValueBar impact={impact} className="mt-5 h-2.5" />
            <dl className="mt-3">
              {(
                [
                  ["bg-sage", "Collected", "Paid by customers", split.collected],
                  [
                    "bg-sage-soft",
                    "Billed, not paid yet",
                    "Invoices on jobs Scout booked",
                    split.billed,
                  ],
                  ["value-est", "Estimated", "Booked jobs not invoiced yet", split.estimated],
                ] as const
              ).map(([fill, label, note, amount]) => (
                <div key={label} className="flex items-center gap-3.5 py-2.5">
                  <span aria-hidden className={`size-3 shrink-0 rounded-full ${fill}`} />
                  <div className="min-w-0 flex-1">
                    <dt className="text-body-lg font-medium text-ink">{label}</dt>
                    <dd className="text-body text-ink-3">{note}</dd>
                  </div>
                  <dd
                    className={`text-body-lg font-semibold tabular-nums ${fill === "value-est" ? "text-ink-2" : "text-ink"}`}
                  >
                    {money(amount)}
                  </dd>
                </div>
              ))}
            </dl>

            <h3 className="mt-5 mb-2 text-body font-medium text-ink-2">Where it came from</h3>
            <ul className="space-y-1.5">
              {CHANNELS.map(({ key, label, icon: Icon }) => {
                const channel = impact.bySource?.[key];
                if (key === "other" && !channel?.total && !channel?.bookings) return null;
                const detail = [
                  channel?.collected ? `${money(channel.collected)} collected` : null,
                  channel?.bookings == null
                    ? "Bookings unknown right now"
                    : plural(channel.bookings, "booking", "bookings"),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={key}
                    className="flex items-center gap-3 rounded-2xl bg-paper px-3.5 py-3"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2">
                      <Icon size={19} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-lg font-medium text-ink">{label}</p>
                      <p className="truncate text-body text-ink-3">{detail}</p>
                    </div>
                    <p className="text-body-lg font-semibold text-ink tabular-nums">
                      {channel ? money(channel.total) : "—"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {notes.length ? (
          <div role="status" className="mt-4 space-y-1.5 text-body text-ink-3">
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}

        <Link
          href="/report"
          onClick={close}
          className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink text-body-lg font-semibold text-paper transition-opacity active:opacity-85"
        >
          Full report <ArrowRight size={18} strokeWidth={1.8} />
        </Link>
      </div>
    </dialog>
  );
}
