import { engagementPriority } from "@/lib/engagement-priority";
export function EngagementBadge({ facts }: { facts: Record<string, string> }) {
  const rating = engagementPriority(facts);
  return (
    <span title={rating.reason} className="mt-1 block text-caption text-ink-3">
      Engagement priority: {rating.grade}
      {rating.points === null ? "" : ` · ${rating.points}/3`}
    </span>
  );
}
export function EngagementRubric() {
  return (
    <details className="my-3 rounded-2xl bg-paper-2 px-4 py-3 text-label text-ink-2">
      <summary className="cursor-pointer font-semibold text-ink">
        Who's more likely to engage? How priority is graded
      </summary>
      <p className="mt-2">Priority based on CRM activity, not a prediction of who will reply.</p>
      <dl className="mt-3 space-y-3">
        {[
          {
            grade: "3/3 · High",
            criteria: [
              "Quote sent or invoice overdue within 30 days",
              "Or a named membership visit with a due date",
            ],
          },
          {
            grade: "2/3 · Medium",
            criteria: [
              "Older quote or overdue invoice",
              "Or service within 12 months",
              "Or a documented plan or equipment need",
            ],
          },
          { grade: "1/3 · Low", criteria: ["More than 12 months without recorded activity"] },
          { grade: "Not rated", criteria: ["Not enough CRM context to assign a priority"] },
        ].map(({ grade, criteria }) => (
          <div key={grade}>
            <dt className="font-semibold text-ink">{grade}</dt>
            <dd className="mt-1">
              <ul className="list-disc space-y-1 pl-4">
                {criteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <p>
          <span className="font-semibold">Checked in order:</span> quote, due visit, invoice age,
          then service history and plan/equipment needs.
        </p>
        <p className="mt-2">
          Bill size and demographics don't affect the grade. Exclusions, consent checks, quiet
          hours, and your recipient choices always apply.
        </p>
      </div>
    </details>
  );
}
export function EngagementExplanation({ facts }: { facts: Record<string, string> }) {
  const rating = engagementPriority(facts);
  return (
    <section
      aria-label="Campaign engagement priority"
      className="rounded-2xl bg-cream/70 px-4 py-3"
    >
      <p className="text-label font-semibold text-ink-3">Campaign engagement priority</p>
      <p className="mt-1 text-body font-semibold text-ink">
        {rating.grade}
        {rating.points === null ? "" : ` · ${rating.points}/3`}
      </p>
      <p className="mt-1 text-body text-ink-2">{rating.reason}</p>
      <p className="mt-2 text-label text-ink-3">
        Based on this campaign's CRM facts. This is outreach priority, not a reply probability or
        the separate estimate Revive score.
      </p>
      <EngagementRubric />
    </section>
  );
}
