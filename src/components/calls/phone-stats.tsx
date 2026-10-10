import { CalendarCheck, Headphones, Phone, PhoneForwarded } from "lucide-react";
import type { ReactNode } from "react";
import type { CallStats } from "@/lib/api";
import { formatTalkTime } from "@/lib/format";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function sentToTeamTile(stats: CallStats): {
  value: string;
  sub: string;
} {
  if (stats.sentToTeam === undefined) {
    return { value: String(stats.escalated), sub: "Handed off to your team" };
  }
  const transferred = stats.transferred ?? 0;
  const texted = stats.texted ?? 0;
  return {
    value: String(stats.sentToTeam),
    sub:
      stats.sentToTeam === 0
        ? "No transfers or texts"
        : `${transferred} transferred · ${texted} texted`,
  };
}
export default function PhoneStats({ stats }: { stats: CallStats }) {
  const teamTile = sentToTeamTile(stats);
  const untracked = stats.sentToTeam === undefined ? 0 : (stats.transferUntracked ?? 0);
  return (
    <section aria-label="Call overview">
      <h2 className="mb-3 text-body font-semibold text-ink-2">Last {stats.days} days</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Tile
          icon={<Phone size={18} strokeWidth={1.8} className="text-skyblue" />}
          label="Inbound calls"
          value={String(stats.totalCalls)}
          sub={plural(stats.uniqueCallers, "caller") + (stats.spam ? ` · ${stats.spam} spam` : "")}
        />

        <Tile
          icon={<Headphones size={18} strokeWidth={1.8} className="text-lavender" />}
          label="Time on the phone"
          value={stats.totalDurationSec > 0 ? formatTalkTime(stats.totalDurationSec) : "—"}
          sub="Talking with callers"
        />
        <Tile
          icon={<CalendarCheck size={18} strokeWidth={1.8} className="text-sage-deep" />}
          label="Booked by Scout"
          value={String(stats.booked)}
          sub="Appointments from calls"
        />

        <Tile
          icon={<PhoneForwarded size={18} strokeWidth={1.8} className="text-copper" />}
          label="Sent to the team"
          value={teamTile.value}
          sub={teamTile.sub}
        />
      </div>
      {stats.unclassifiedCalls || untracked ? (
        <div className="mt-3 space-y-1 text-body text-ink-3">
          {stats.unclassifiedCalls ? (
            <p>
              {plural(stats.unclassifiedCalls, "imported call")}{" "}
              {stats.unclassifiedCalls === 1 ? "isn’t" : "aren’t"} counted in these numbers.
            </p>
          ) : null}

          {untracked ? (
            <p>
              {plural(untracked, "earlier call")} came in before Scout tracked transfers, so{" "}
              {untracked === 1 ? "a transfer on it isn’t" : "transfers on them aren’t"} counted.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
function Tile({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <dl className="min-w-0 rounded-2xl bg-paper p-4 shadow-soft sm:p-5">
      <dt className="flex items-center gap-2 text-body font-medium text-ink-2">
        <span aria-hidden="true" className="shrink-0 max-sm:hidden">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-2.5 font-tabular text-h1 font-semibold tracking-tight text-ink sm:text-display">
        {value}
      </dd>
      <dd className="mt-1 text-label text-ink-3">{sub}</dd>
    </dl>
  );
}
