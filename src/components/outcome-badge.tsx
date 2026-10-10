import type { CallOutcome } from "@/lib/api";
import { OUTCOME_META } from "@/lib/call-outcomes";
export default function OutcomeBadge({ outcome }: { outcome?: CallOutcome }) {
  const c = outcome ? OUTCOME_META[outcome] : undefined;
  if (!c) return null;
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-semibold ${c.pillBg} ${c.pillText}`}
    >
      {c.label}
    </span>
  );
}
export function OutcomeTag({ outcome }: { outcome?: CallOutcome }) {
  const c = outcome ? OUTCOME_META[outcome] : undefined;
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${c.dot}`} />
      <span className={`text-caption font-semibold uppercase tracking-wide ${c.text}`}>
        {c.label}
      </span>
    </span>
  );
}
