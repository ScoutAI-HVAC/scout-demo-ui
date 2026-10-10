"use client";
import type { ScoutImpact as Impact } from "@/lib/scout-impact";
import { useScoutImpact } from "@/lib/use-scout-impact";
const money = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
export default function ScoutImpact() {
  const { impact, failed } = useScoutImpact();
  return <ScoutImpactSummary impact={impact} failed={failed} />;
}
export function ScoutImpactSummary({
  impact,
  failed = false,
  breakdown = false,
}: {
  impact: Impact | null;
  failed?: boolean;
  breakdown?: boolean;
}) {
  const value = breakdown ? impact?.total : impact?.bySource?.campaign.total;
  const title = breakdown ? "Scout's tracked value" : "Value from campaigns";
  return (
    <section
      aria-label={breakdown ? "Scout value" : "Value from campaigns"}
      className="mb-4 rounded-2xl bg-[#2e6154] px-4 py-3 text-[#fffaf1] sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div>
          <p className="text-label font-bold uppercase tracking-[0.12em]">{title}</p>
          <p className="mt-1 text-label">
            {breakdown
              ? "Collected, invoiced, and estimated booking value from phone calls, campaigns, and texts & leads"
              : "Collected, invoiced, and estimated value from campaigns only. Your Scout value total also counts phone and text bookings."}
          </p>
        </div>
        <div className="text-[28px] font-bold leading-tight tabular-nums sm:text-[32px]">
          {value === undefined ? "—" : money(value)}
        </div>
      </div>
      {failed ? (
        <p role="status" className="mt-2 text-label">
          Couldn't refresh value.
          {impact ? " Showing the last verified read." : " No total is being guessed."}
        </p>
      ) : null}
      {breakdown && impact ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-label sm:grid-cols-4">
          {[
            [
              "Confirmed bookings",
              impact.trackedBookings === null ? "—" : String(impact.trackedBookings),
            ],
            ["Payments collected", money(impact.recovered)],
            ["Remaining invoiced value", money(impact.total - impact.recovered - impact.estimated)],
            ["Estimated remaining value", money(impact.estimated)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="mt-1 text-body-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {breakdown ? (
        <p className="mt-2 text-label">All time · confirmed bookings exclude cancellations</p>
      ) : null}
      {breakdown && impact?.partial ? (
        <p className="mt-2 text-label">Known tracked value · incomplete or unpriced data</p>
      ) : null}
      {!breakdown ? null : impact ? (
        <>
          {impact.pendingBookings > 0 ? (
            <p className="mt-2 text-label">
              {impact.pendingBookings} booking records are awaiting CRM verification or pricing.
              Unconfirmed attempts are excluded from confirmed bookings.
            </p>
          ) : null}
          {impact.unpricedBookings !== null && impact.unpricedBookings > 0 ? (
            <p className="mt-2 text-label">
              {impact.unpricedBookings} bookings don’t yet have a supported value.
            </p>
          ) : null}
          <p className="mt-2 text-label opacity-90">
            Includes estimated booking value, not just collected payments. Each job or invoice
            counts once. Estimates use accepted quotes or the average of at least five priced
            completed jobs in the last 180 days, from up to 500 recent records; invoices replace
            estimates. Payments reduce the remaining value.
            {impact.unreadBookings
              ? ` ${impact.unreadBookings} ${impact.unreadBookings === 1 ? "booking is" : "bookings are"} waiting on a fresh CRM check.`
              : ""}
          </p>
        </>
      ) : !failed ? (
        <p className="mt-3 text-label">Reading the records behind the number…</p>
      ) : null}
    </section>
  );
}
