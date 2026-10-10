import { humanizeToken } from "@/lib/pro-case";
interface CampaignRow {
  id: string;
  name: string;
  state: string;
  touchesSent: number;
  replied: number;
  paid: number;
  booked: number;
  collectedDollars: number;
  wonDollars?: number;
  enrolled?: number;
  enrolledInWindow?: number;
  optedOut?: number;
  failed?: number;
}
export function ReportCampaignCards({ rows }: { rows: CampaignRow[] }) {
  return (
    <div className="space-y-3 sm:hidden print:hidden">
      {rows.map((row) => (
        <article key={row.id} className="rounded-3xl bg-paper p-5 shadow-soft">
          <h3 className="text-body-lg font-semibold text-ink">{row.name}</h3>
          <p className="mt-1 text-label text-ink-3">{humanizeToken(row.state)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            {[
              ["Texts sent", row.touchesSent],
              ["Replied", row.replied],
              ["Paid", row.paid],
              ["Booked", row.booked],
              ["Collected", `$${Math.round(row.collectedDollars).toLocaleString("en-US")}`],
              ["After outreach", `$${Math.round(row.wonDollars ?? 0).toLocaleString("en-US")}`],
              ...(row.enrolled === undefined
                ? []
                : [["Enrolled (new)", row.enrolledInWindow ?? row.enrolled]]),
              ...(row.optedOut === undefined ? [] : [["Opted out", row.optedOut]]),
              ...(row.failed === undefined ? [] : [["Failing", row.failed]]),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-label text-ink-2">{label}</dt>
                <dd className="mt-1 break-words text-body-lg font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
      {rows.length === 0 ? (
        <p className="rounded-3xl bg-paper p-5 text-body text-ink-2 shadow-soft">
          No campaigns to report in this window.
        </p>
      ) : null}
    </div>
  );
}
