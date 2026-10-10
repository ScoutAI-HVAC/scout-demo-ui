export interface CampaignAnalytics {
  bookings: number;
  customersReached: number;
  customersReplied: number | null;
  testCampaignsExcluded?: number;
  cancelledBookings?: number;
}
export function campaignScopeNote(analytics: CampaignAnalytics | null | undefined): string | null {
  if (!analytics) return null;
  const tests = analytics.testCampaignsExcluded ?? 0;
  const left =
    tests > 0
      ? ` ${tests} test campaign${tests === 1 ? " isn't" : "s aren't"} counted here; ` +
        `${tests === 1 ? "its" : "their"} texts went to your test phone.`
      : "";
  const cancelled = analytics.cancelledBookings ?? 0;
  const dropped =
    cancelled > 0
      ? ` ${cancelled} booking${cancelled === 1 ? " was" : "s were"} cancelled in your CRM and ` +
        `${cancelled === 1 ? "isn't" : "aren't"} counted.`
      : "";
  return `Real customers, each counted once across campaigns.${left}${dropped}`;
}
export function CampaignOverview({
  analytics,
}: {
  analytics: CampaignAnalytics | null | undefined;
}) {
  const note = campaignScopeNote(analytics);
  return (
    <div className="mb-9">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { label: "Campaign bookings", value: analytics?.bookings },
          { label: "Customers reached", value: analytics?.customersReached },
          { label: "Customers replied", value: analytics?.customersReplied },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl bg-paper px-3.5 py-3.5 shadow-soft sm:px-5 sm:py-4"
          >
            <div className="text-label leading-snug text-ink-2 sm:text-body">{label}</div>
            <div className="mt-1.5 text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
              {typeof value === "number" && Number.isFinite(value)
                ? value.toLocaleString("en-US")
                : "—"}
            </div>
          </div>
        ))}
      </div>
      {note ? <p className="mt-2 text-label text-ink-3">{note}</p> : null}
    </div>
  );
}
export function TestCampaignTag() {
  return (
    <span
      title="Texts went to your test phone. Not counted in the totals above."
      className="inline-flex shrink-0 items-center rounded-full bg-skyblue-tint px-2.5 py-0.5 text-label font-semibold text-ink"
    >
      Test
    </span>
  );
}
