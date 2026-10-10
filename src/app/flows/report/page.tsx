"use client";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ReportCampaignCards } from "@/components/report-campaign-cards";
import { useShopClock } from "@/components/shop-clock";
import { humanizeToken } from "@/lib/pro-case";
import { campaignReportRows, downloadReportCsv } from "@/lib/report-csv";
import { shopDate, type ShopClock } from "@/lib/shop-time";
interface FlowRow {
  id: string;
  name: string;
  scope: string;
  state: string;
  enrolled: number;
  enrolledInWindow?: number;
  touchesSent: number;
  replied: number;
  paid: number;
  booked: number;
  optedOut: number;
  failed: number;
  collectedDollars: number;
  wonDollars?: number;
}
interface Report {
  sinceMs: number;
  generatedAtMs: number;
  flows: FlowRow[];
  totals: {
    touchesSent: number;
    touchesSkipped: number;
    ticks: number;
    failedTicks: number;
    refusals: Record<string, number>;
  };
  smsVolume: {
    proactive: number;
    repliesAnswered: number;
    inbound: number;
  } | null;
}
const day = (ms: number, clock: ShopClock) =>
  shopDate(ms, clock, { month: "long", day: "numeric", year: "numeric" });
const REFUSAL_WORDS: Record<string, string> = {
  stopped_paid: "Stopped · they paid",
  stopped_booked: "Stopped · they booked",
  stopped_replied: "Stopped · they wrote back",
  stopped_opted_out: "Stopped · at the customer's request",
  outside_window: "Waiting for your send hours",
  quiet_hours: "Waiting for daytime where they live",
  daily_cap: "Waiting · the day's batch was full",
  in_cooldown: "Waiting · chased recently",
  frequency_capped: "Waiting · already texted this week",
  taken_over: "Waiting · you were handling it",
  unreachable: "Texts do not reach this number",
  unknown_recipient: "Not a customer in your book",
  no_consent: "Permission to text has not been recorded",
  errored: "Scout hit an error preparing the message",
  ledger_unreadable: "Texting eligibility could not be checked",
  sends_not_live: "Sends are not live yet",
  not_in_allowlist: "Test mode · not the test phone",
  duplicate_send: "Already sent",
  unrecordable: "Could not be recorded, so was not sent",
};
export default function FlowsReportPage() {
  const clock = useShopClock();
  const [report, setReport] = useState<Report | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/flows/report", { cache: "no-store" });
      if (!res.ok) {
        setUnreachable(true);
        return;
      }
      setReport((await res.json()) as Report);
    })().catch(() => setUnreachable(true));
  }, []);
  if (unreachable) {
    return (
      <div className="mx-auto max-w-3xl pt-[8vh] text-body text-ink-3">
        The flow engine is not reachable, so there is nothing honest to report.
      </div>
    );
  }
  if (!report) {
    return <div className="mx-auto max-w-3xl pt-[8vh] text-body text-ink-3">Building report…</div>;
  }
  const collected = report.flows.reduce((sum, f) => sum + f.collectedDollars, 0);
  const won = report.flows.reduce((sum, f) => sum + (f.wonDollars ?? 0), 0);
  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 pt-4 pb-12 print:max-w-none print:p-8">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <a
        href="/flows"
        className="no-print mb-4 inline-flex min-h-11 self-start items-center gap-2 text-body font-medium text-ink-2 hover:text-ink"
      >
        <ChevronLeft size={16} aria-hidden="true" /> Campaigns
      </a>
      <div className="no-print order-last mt-8 flex flex-wrap gap-3 border-t border-tan-soft pt-5">
        <button
          type="button"
          onClick={() =>
            downloadReportCsv(
              "scout-campaign-report.csv",
              campaignReportRows(report.flows, report.sinceMs, report.generatedAtMs),
            )
          }
          className="secondary-control flex-1 sm:flex-none"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="secondary-control flex-1 sm:flex-none"
        >
          Generate PDF
        </button>
      </div>

      <p className="text-label font-semibold text-ink-3">Campaign report</p>
      <h1 className="mt-2 font-display text-3xl leading-tight text-ink">Your month, in view.</h1>
      <p className="mt-4 rounded-xl bg-paper-2 px-4 py-3 text-body text-ink-2">
        {day(report.sinceMs, clock)} &ndash; {day(report.generatedAtMs, clock)}
      </p>

      <section
        aria-label="Recovered invoice payments"
        className="mt-5 rounded-3xl bg-sage-deep p-6 text-on-accent print:break-inside-avoid"
      >
        <p className="text-label font-semibold">Invoice payments recovered</p>
        <p className="mt-2 break-words text-4xl font-semibold">
          ${Math.round(collected).toLocaleString("en-US")}
        </p>
        <p className="mt-3 text-label text-on-accent/80">
          Running total since each included campaign launched, not just this report period.
        </p>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(
          [
            ["Value after outreach", `$${Math.round(won).toLocaleString("en-US")}`],
            ["Messages sent", report.totals.touchesSent],
            ...(report.smsVolume
              ? ([["Customer texts answered", report.smsVolume.repliesAnswered]] as Array<
                  [string, string | number]
                >)
              : []),
            ["Replied", report.flows.reduce((sum, f) => sum + f.replied, 0)],
            ["Paid", report.flows.reduce((sum, f) => sum + f.paid, 0)],
            ["Booked", report.flows.reduce((sum, f) => sum + f.booked, 0)],
            ["Opted out", report.flows.reduce((sum, f) => sum + f.optedOut, 0)],
          ] as Array<[string, string | number]>
        ).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-2xl border border-tan-soft bg-paper p-4">
            <div className="text-label text-ink-3">{label}</div>
            <div className="mt-2 break-words text-2xl font-semibold text-ink">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-2 text-body-lg font-semibold text-ink">By campaign</h2>

      <p className="mb-2 text-label text-ink-3">
        Flows that were working during this period. Apart from the new enrollments, each row is that
        flow&apos;s running total since it launched, not just this period. “After outreach” includes
        payments on later invoices and accepted quotes within 90 days of the first text. It can
        include work booked by the office, so it is not added to Scout’s tracked value.
      </p>
      <ReportCampaignCards rows={report.flows} />
      <div className="hidden overflow-x-auto rounded-2xl border border-tan-soft bg-paper sm:block print:block">
        <table className="w-full text-left text-body text-ink">
          <thead>
            <tr className="border-b border-tan-soft text-label uppercase tracking-[0.1em] text-ink-3">
              {[
                "Flow",
                "State",
                "Enrolled (new)",
                "Sent",
                "Replied",
                "Paid",
                "Booked",
                "Opted out",
                "Failing",
                "Collected",
                "After outreach",
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.flows.map((f) => (
              <tr key={f.id} className="border-b border-tan-soft last:border-0">
                <td className="px-3 py-2">{f.name}</td>
                <td className="px-3 py-2">{humanizeToken(f.state)}</td>
                <td className="px-3 py-2">
                  {f.enrolledInWindow ?? f.enrolled}
                  {f.enrolledInWindow !== undefined && f.enrolled !== f.enrolledInWindow ? (
                    <span className="text-ink-3"> of {f.enrolled}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{f.touchesSent}</td>
                <td className="px-3 py-2">{f.replied}</td>
                <td className="px-3 py-2">{f.paid}</td>
                <td className="px-3 py-2">{f.booked}</td>
                <td className="px-3 py-2">{f.optedOut}</td>
                <td className="px-3 py-2">{f.failed}</td>
                <td className="px-3 py-2">
                  ${Math.round(f.collectedDollars).toLocaleString("en-US")}
                </td>
                <td className="px-3 py-2">
                  ${Math.round(f.wonDollars ?? 0).toLocaleString("en-US")}
                </td>
              </tr>
            ))}
            {report.flows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-3 text-ink-3">
                  No flows existed in this window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {Object.keys(report.totals.refusals).length > 0 ? (
        <>
          <h2 className="mt-8 mb-2 text-body-lg font-semibold text-ink">Why sends were refused</h2>
          <div className="rounded-2xl border border-tan-soft bg-paper px-4 py-3 text-body text-ink-2">
            {Object.entries(report.totals.refusals)
              .toSorted((a, b) => b[1] - a[1])
              .map(([code, count]) => (
                <div key={code}>
                  {count} &times; {REFUSAL_WORDS[code] ?? humanizeToken(code)}
                </div>
              ))}
          </div>
        </>
      ) : null}

      <p className="mt-8 text-label text-ink-3">
        Engine ran {report.totals.ticks} cycles in this window
        {report.totals.failedTicks > 0 ? `, ${report.totals.failedTicks} reported errors` : ""}.
        Collected dollars are summed from invoices whose enrollment ended in &ldquo;paid&rdquo;. Won
        dollars are what customers ran up on invoices dated after Scout&rsquo;s first text to them,
        within 90 days, priced from the payments the books applied - one invoice counts for one
        flow, never both.
      </p>
    </div>
  );
}
