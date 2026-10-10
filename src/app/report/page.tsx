"use client";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ReportCampaignCards } from "@/components/report-campaign-cards";
import { ScoutImpactSummary } from "@/components/scout-impact";
import { useShopClock } from "@/components/shop-clock";
import StatCard from "@/components/stat-card";
import { humanizeToken } from "@/lib/pro-case";
import { campaignReportRows, downloadReportCsv } from "@/lib/report-csv";
import type { ScoutImpact } from "@/lib/scout-impact";
import { shopDate, type ShopClock } from "@/lib/shop-time";
interface FlowRow {
  id: string;
  name: string;
  state: string;
  enrolled: number;
  touchesSent: number;
  replied: number;
  paid: number;
  booked: number;
  optedOut: number;
  collectedDollars: number;
  wonDollars?: number;
}
interface Report {
  impact: ScoutImpact | null;
  sinceMs: number;
  generatedAtMs: number;
  windowDays: number;
  flows: {
    flows: FlowRow[];
    totals: {
      touchesSent: number;
    };
    smsVolume: {
      proactive: number;
      repliesAnswered: number;
      inbound: number;
    } | null;
  } | null;
  calls: {
    totalCalls: number;
    answered: number;
    booked: number;
    escalated: number;
    spam: number;
    afterHours: number;
    avgDurationSec: number;
    totalDurationSec: number;
    uniqueCallers: number;
  } | null;
  escalations: {
    total: number;
    byReason: Record<string, number>;
  } | null;
}
const day = (ms: number, clock: ShopClock) =>
  shopDate(ms, clock, { month: "long", day: "numeric", year: "numeric" });
function talkTime(totalSec: number): string {
  const minutes = Math.round(totalSec / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
const MIN_PER_TEXT_CONVERSATION = 4;
const MIN_PER_CHASE_TOUCH = 6;
const ABSENT = "—";
function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
const REASON_LABELS: Record<string, string> = {
  financing: "Asked about financing or payment plans",
  wants_to_book: "Wanted to book or accept a quote",
  maintenance_plan: "asked about a maintenance plan",
  needs_human: "Asked for a person",
  dispute: "Disputed a charge",
  upset: "Sounded upset",
};
function Hero({ value, label, note }: { value: string; label: string; note?: string }) {
  return <StatCard variant="metric" value={value} label={label} sub={note} />;
}
function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="text-title font-semibold leading-none text-ink">{value}</div>
      <div className="mt-2 text-label font-medium text-ink-2">{label}</div>
      {note ? <div className="mt-0.5 text-label text-ink-3">{note}</div> : null}
    </div>
  );
}
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 break-inside-avoid">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        {subtitle ? <span className="text-body text-ink-3">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-paper p-5 shadow-soft sm:p-6 print:border print:border-tan-soft">
      {children}
    </div>
  );
}
export default function MonthlyReportPage() {
  const clock = useShopClock();
  const [report, setReport] = useState<Report | null>(null);
  const [shopName, setShopName] = useState<string>("");
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/report", { cache: "no-store" });
      if (!res.ok) {
        setUnreachable(true);
        return;
      }
      setReport((await res.json()) as Report);
    })();
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            company?: {
              name?: string;
            };
          };
          const name = data.company?.name?.trim();
          if (name) {
            setShopName(name);
          }
        }
      } catch {}
    })();
  }, []);
  if (unreachable) {
    return (
      <div className="mx-auto max-w-3xl pt-[8vh] text-body text-ink-3">
        The report sources are not reachable, so there is nothing honest to report.
      </div>
    );
  }
  if (!report) {
    return <div className="mx-auto max-w-3xl pt-[8vh] text-body text-ink-3">Building report…</div>;
  }
  const flows = report.flows;
  const calls = report.calls;
  const collected = flows ? flows.flows.reduce((sum, f) => sum + f.collectedDollars, 0) : null;
  const won = flows ? flows.flows.reduce((sum, f) => sum + (f.wonDollars ?? 0), 0) : null;
  const activeFlows = flows ? flows.flows.filter((f) => f.enrolled > 0 || f.touchesSent > 0) : [];
  const quotesAccepted = flows ? flows.flows.reduce((sum, f) => sum + f.booked, 0) : 0;
  const phoneSec = calls?.totalDurationSec ?? 0;
  const textConversations = flows?.smsVolume?.repliesAnswered ?? 0;
  const chaseTouches = flows?.totals.touchesSent ?? 0;
  const estimatedExtraMin =
    textConversations * MIN_PER_TEXT_CONVERSATION + chaseTouches * MIN_PER_CHASE_TOUCH;
  const totalGivenBackMin = Math.round(phoneSec / 60) + estimatedExtraMin;
  const hasTimeSaved = phoneSec > 0 || textConversations > 0 || chaseTouches > 0;
  return (
    <div className="mx-auto flex max-w-5xl flex-col pt-2 pb-10 print:max-w-none print:px-10 print:pt-0 print:pb-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <a
        href="/"
        className="no-print mb-4 inline-flex min-h-11 self-start items-center gap-2 text-body font-medium text-ink-2 hover:text-ink"
      >
        <ChevronLeft size={16} aria-hidden="true" /> Home
      </a>
      <div className="no-print order-last mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            downloadReportCsv("scout-report.csv", [
              ...campaignReportRows(flows?.flows ?? [], report.sinceMs, report.generatedAtMs),
              [],
              ["Scout tracked value", report.impact?.total, "All time, includes estimates"],
              ["Payments collected", report.impact?.recovered, "All time"],
              [
                "Remaining invoiced value",
                report.impact
                  ? report.impact.total - report.impact.recovered - report.impact.estimated
                  : undefined,
                "All time",
              ],
              ["Estimated remaining value", report.impact?.estimated, "All time"],
              [
                "Value data",
                report.impact ? (report.impact.partial ? "Incomplete" : "Complete") : "Unavailable",
              ],
              [],
              ["Phone metrics", "Value", "Basis"],
              ...(calls
                ? Object.entries(calls).map(([key, value]) => [key, value, "Report window"])
                : [["Phone data", "Unavailable"]]),
              [],
              ["Campaign data", flows ? "Available" : "Unavailable"],
              ["Owner escalations", report.escalations?.total, "Report window"],
            ])
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

      <header className="px-1 pb-3">
        <p className="text-label font-semibold uppercase tracking-[0.14em] text-terracotta-deep">
          Monthly report
        </p>
        <h1 className="mt-2 font-display text-display leading-tight text-ink sm:text-5xl">
          Your month, in view.
        </h1>
        {shopName ? <p className="mt-3 text-body-lg font-medium text-ink">{shopName}</p> : null}
        <p className="mt-1 text-body text-ink-2">
          What Scout handled, {day(report.sinceMs, clock)} &ndash;{" "}
          {day(report.generatedAtMs, clock)}
        </p>
      </header>

      <section aria-label="Report overview">
        <div className="mt-6">
          <ScoutImpactSummary impact={report.impact ?? null} failed={!report.impact} breakdown />
        </div>

        <div className="rounded-3xl bg-sage-tint p-6 print:break-inside-avoid">
          <p className="text-body font-semibold text-ink">Receivables recovered by campaigns</p>
          <p className="mt-2 break-words font-tabular text-4xl font-semibold text-sage-deep">
            {collected === null ? ABSENT : money(collected)}
          </p>
          <p className="mt-3 text-label text-ink-2">
            {collected === null
              ? "Campaign payment data is unavailable."
              : "Running total since each flow launched"}
          </p>
        </div>

        <section className="mt-3 grid grid-cols-2 gap-3 [&>dl]:rounded-3xl [&>dl]:shadow-soft [&>dl:last-child]:col-span-2 xl:grid-cols-5 xl:[&>dl:last-child]:col-span-1 print:break-inside-avoid print:[&>dl]:border print:[&>dl]:border-tan-soft">
          <Hero
            value={won === null ? ABSENT : money(won)}
            label="Value after outreach"
            note="Payments and accepted quotes after outreach; not added to Scout’s tracked value"
          />
          <Hero value={calls ? String(calls.answered) : ABSENT} label="Calls handled" />
          <Hero
            value={calls && calls.totalDurationSec > 0 ? talkTime(calls.totalDurationSec) : ABSENT}
            label="On the phone"
          />
          <Hero value={calls ? String(calls.booked) : ABSENT} label="Phone bookings" />
          <Hero
            value={flows?.smsVolume ? String(flows.smsVolume.repliesAnswered) : ABSENT}
            label="Texts answered"
            note="No human needed"
          />
        </section>
      </section>

      {calls ? (
        <Section title="The phone" subtitle="Every call, answered">
          <Card>
            <div className="flex flex-wrap gap-x-10 gap-y-6">
              <Stat value={String(calls.answered)} label="Conversations" />
              <Stat
                value={String(calls.afterHours)}
                label="After hours"
                note="While the office was closed"
              />
              <Stat value={String(calls.booked)} label="Booked" />
              <Stat value={String(calls.escalated)} label="Handed to you" />
              <Stat value={String(calls.spam)} label="Spam blocked" />
              <Stat
                value={calls.avgDurationSec > 0 ? talkTime(calls.avgDurationSec) : ABSENT}
                label="Avg call"
              />
              <Stat value={String(calls.uniqueCallers)} label="Unique callers" />
            </div>
          </Card>
        </Section>
      ) : null}

      {flows ? (
        <Section title="The money" subtitle="Chased for you">
          <ReportCampaignCards rows={activeFlows} />
          <div className="hidden overflow-x-auto rounded-3xl bg-paper shadow-soft sm:block print:block print:border print:border-tan-soft">
            <table className="w-full text-left text-body text-ink">
              <thead>
                <tr className="bg-paper-2/70 text-label text-ink-2">
                  <th className="px-5 py-3 font-semibold">Flow</th>
                  <th className="px-3 py-3 text-right font-semibold">Texts sent</th>
                  <th className="px-3 py-3 text-right font-semibold">Replied</th>
                  <th className="px-3 py-3 text-right font-semibold">Paid</th>
                  <th className="px-3 py-3 text-right font-semibold">Booked</th>
                  <th className="px-5 py-3 text-right font-semibold">Collected</th>
                  <th className="px-5 py-3 text-right font-semibold">After outreach</th>
                </tr>
              </thead>
              <tbody>
                {activeFlows.map((f) => (
                  <tr key={f.id} className="border-b border-tan-soft/70 last:border-0">
                    <td className="px-5 py-3">{f.name}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{f.touchesSent}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{f.replied}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{f.paid}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{f.booked}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {money(f.collectedDollars)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {money(f.wonDollars ?? 0)}
                    </td>
                  </tr>
                ))}
                {activeFlows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-4 text-ink-3">
                      No money flows ran in this window.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 px-1 text-label leading-relaxed text-ink-3">
            Each flow&apos;s numbers are its running total since it launched, not just this period.
            “After outreach” includes payments on later invoices and accepted quotes within 90 days
            of the first text. It can include work booked by the office, so it is not added to
            Scout’s tracked value.
            {quotesAccepted > 0
              ? " \u201cBooked\u201d includes quotes the customer accepted after a chase \u2014 counted as wins, never as collected cash."
              : ""}
          </p>
        </Section>
      ) : null}

      {flows?.smsVolume || report.escalations ? (
        <Section title="The conversations" subtitle="Handled by text">
          <Card>
            <div className="flex flex-wrap gap-x-10 gap-y-6">
              {flows?.smsVolume ? (
                <>
                  <Stat value={String(flows.totals.touchesSent)} label="Chase texts sent" />
                  <Stat value={String(flows.smsVolume.repliesAnswered)} label="Texts answered" />
                  <Stat value={String(flows.smsVolume.inbound)} label="Texts received" />
                </>
              ) : null}
              {report.escalations ? (
                <Stat
                  value={String(report.escalations.total)}
                  label="Leads handed to you"
                  note="Flagged for a callback"
                />
              ) : null}
            </div>
            {report.escalations && report.escalations.total > 0 ? (
              <div className="mt-6 space-y-1.5 text-body text-ink-2">
                {Object.entries(report.escalations.byReason)
                  .toSorted((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <div key={reason}>
                      <span className="font-semibold tabular-nums">{count}</span>{" "}
                      {REASON_LABELS[reason] ?? humanizeToken(reason)}
                    </div>
                  ))}
              </div>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {hasTimeSaved ? (
        <Section title="Time given back" subtitle="Hours off your desk">
          <Card>
            <div className="text-display font-semibold leading-none text-sage-deep">
              ~{talkTime(totalGivenBackMin * 60)}
            </div>
            <div className="mt-2 text-label font-medium text-ink-2">
              This month &middot; phone, text &amp; collections
            </div>
            <div className="mt-6 space-y-1.5 text-body text-ink-2">
              {phoneSec > 0 ? (
                <div>
                  <span className="font-semibold">{talkTime(phoneSec)}</span>
                  {" of phone conversation Scout carried, "}
                  <span className="text-ink-3">measured</span>.
                </div>
              ) : null}
              {textConversations > 0 ? (
                <div>
                  <span className="font-semibold">{textConversations}</span>
                  {textConversations === 1
                    ? " text conversation handled, "
                    : " text conversations handled, "}
                  <span className="text-ink-3">
                    {`estimated at ${MIN_PER_TEXT_CONVERSATION} min each`}
                  </span>
                  .
                </div>
              ) : null}
              {chaseTouches > 0 ? (
                <div>
                  <span className="font-semibold">{chaseTouches}</span>
                  {chaseTouches === 1 ? " payment reminder sent, " : " payment reminders sent, "}
                  <span className="text-ink-3">
                    {`estimated at ${MIN_PER_CHASE_TOUCH} min each vs. calling and noting the account by hand`}
                  </span>
                  .
                </div>
              ) : null}
            </div>
          </Card>
        </Section>
      ) : null}

      <p className="mt-10 px-1 text-label leading-relaxed text-ink-3">
        Phone time is measured from real call durations. Lines marked &ldquo;estimated&rdquo; state
        their assumption inline. Sections whose records could not be read are omitted rather than
        shown as zero.
      </p>
    </div>
  );
}
