"use client";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Moon,
  PhoneIncoming,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CustomerProvenanceTag, provenanceOf } from "@/components/customer-provenance";
import OutcomeBadge from "@/components/outcome-badge";
import { useShopClock } from "@/components/shop-clock";
import { markCallReviewed, type Call } from "@/lib/api";
import { features } from "@/lib/features";
import { formatDateTime, formatPhone, tidyLine } from "@/lib/format";
const AUTOMATED_NOISE =
  /\bautomated (message|alert|call|recording)\b|national weather service|\bweather service\b|flash flood|tornado (watch|warning)|severe (thunderstorm|weather)|emergency alert system|amber alert/i;
function isAutomatedNoise(call: Call): boolean {
  return AUTOMATED_NOISE.test(call.summary ?? "");
}
function callSubject(call: Call): string {
  if (call.summary?.trim()) return tidyLine(call.summary, 150);
  if (call.outcome === "booked") return "Booked a job with Scout.";
  if (call.outcome === "escalated") return "Asked for a callback from the team.";
  if (call.outcome === "unresolved") return "Their need was left open - worth a callback.";
  if (call.outcome === "no-connect") return "Call ended before Scout could collect full details.";
  return "Called after hours. Open the call for details.";
}
function UrgencyBadge({ call }: { call: Call }) {
  if (call.emergency) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-alarm-tint px-2.5 py-1 text-caption font-semibold text-alarm">
        <AlertTriangle size={12} strokeWidth={2.4} />
        {call.emergencySeverity === "critical" ? "Critical" : "Urgent"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-pill bg-paper-2 px-2.5 py-1 text-caption font-semibold text-ink-3">
      Routine
    </span>
  );
}
function CallRow({
  call,
  expanded,
  muted,
  onToggle,
}: {
  call: Call;
  expanded: boolean;
  muted?: boolean;
  onToggle: (id: string) => void;
}) {
  const clock = useShopClock();
  const caller = call.callerName?.trim() || formatPhone(call.callerPhone) || "Unknown caller";
  const [recordingGone, setRecordingGone] = useState(false);
  return (
    <div
      className={`ios-sep ${call.emergency && !muted ? "bg-alarm-tint/30" : ""} ${muted ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        onClick={() => onToggle(call.id)}
        aria-expanded={expanded}
        className="group flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-cream"
      >
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${call.emergency ? "bg-alarm text-on-accent" : "bg-skyblue-tint text-skyblue"}`}
        >
          {call.emergency ? (
            <AlertTriangle size={17} strokeWidth={2.3} />
          ) : (
            <PhoneIncoming size={17} strokeWidth={2.3} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{caller}</span>
            <UrgencyBadge call={call} />
            {call.customerMatchStatus && (
              <CustomerProvenanceTag provenance={provenanceOf(call.customerMatchStatus)} />
            )}
          </span>
          {!expanded && (
            <span className="mt-1 block text-body leading-relaxed text-ink-2">
              {callSubject(call)}
            </span>
          )}
          <span className="mt-1.5 block text-label text-ink-3">
            {formatDateTime(call.startedAt, clock)}
          </span>
        </span>

        <ChevronDown
          size={18}
          strokeWidth={2.2}
          className={`mt-2 shrink-0 text-ink-4 transition-transform group-hover:text-ink-2 ${expanded ? "" : "-rotate-90"}`}
        />
      </button>

      {expanded && (
        <div className="animate-fadeIn space-y-4 px-5 pb-5 pl-[4.25rem]">
          {call.summary?.trim() && (
            <p className="text-body leading-relaxed text-ink-2">{call.summary}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-label text-ink-3">
            <span>
              Started <span className="text-ink-2">{formatDateTime(call.startedAt, clock)}</span>
            </span>
            {call.outcome && (
              <span className="flex items-center gap-1.5">
                Outcome <OutcomeBadge outcome={call.outcome} />
              </span>
            )}
          </div>

          {features.callRecordings &&
            call.recordingUrl &&
            (recordingGone ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-tan-soft bg-cream px-4 py-2 text-label text-ink-3">
                <span>Couldn&rsquo;t load this recording.</span>
                <button
                  type="button"
                  onClick={() => setRecordingGone(false)}
                  className="flex-shrink-0 rounded-lg border border-tan-soft bg-paper px-2.5 py-1 font-medium text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                >
                  Try again
                </button>
              </div>
            ) : (
              <audio
                controls
                src={`/api/calls/${encodeURIComponent(call.id)}/recording`}
                className="h-9 w-full"
                preload="metadata"
                onError={() => setRecordingGone(true)}
              >
                Your browser does not support audio playback.
              </audio>
            ))}

          <a
            href="/calls?tab=history"
            className="inline-flex items-center gap-1 text-label font-medium text-terracotta-deep hover:underline"
          >
            Open in Call Center
            <ArrowUpRight size={13} strokeWidth={2.2} />
          </a>
        </div>
      )}
    </div>
  );
}
export default function AfterHoursCallList({ calls }: { calls: Call[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [showReviewed, setShowReviewed] = useState(false);
  const relevant = useMemo(() => calls.filter((c) => !isAutomatedNoise(c)), [calls]);
  const isReviewed = (c: Call) => Boolean(c.reviewedAt) || reviewedIds.has(c.id);
  const unreviewed = relevant.filter((c) => !isReviewed(c) || c.id === expandedId);
  const reviewed = relevant.filter((c) => isReviewed(c) && c.id !== expandedId);
  if (relevant.length === 0) return null;
  function review(id: string) {
    if (reviewedIds.has(id)) return;
    setReviewedIds((prev) => new Set(prev).add(id));
    void markCallReviewed(id).catch(() => {});
  }
  function toggle(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
    review(id);
  }
  function reviewAll() {
    setExpandedId(null);
    for (const c of unreviewed) review(c.id);
  }
  return (
    <section className="animate-fadeIn stagger-2">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-ink-3">
            <Moon size={15} strokeWidth={2.2} />
            <span className="text-caption font-semibold uppercase tracking-[0.14em]">
              While the office was closed
            </span>
          </div>
          <h2 className="font-display text-h1 font-medium text-ink">After-hours calls</h2>
        </div>
        {unreviewed.length > 0 && (
          <button
            type="button"
            onClick={reviewAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-tan-soft bg-paper px-3 py-1.5 text-label font-medium text-ink-2 shadow-soft transition-colors hover:bg-cream hover:text-ink"
          >
            <Check size={13} strokeWidth={2.4} />
            Mark all reviewed
          </button>
        )}
      </div>

      {unreviewed.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-tan-soft bg-paper shadow-card">
          {unreviewed.map((call) => (
            <CallRow
              key={call.id}
              call={call}
              expanded={expandedId === call.id}
              onToggle={toggle}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-2xl border border-tan-soft bg-paper px-5 py-4 text-body text-ink-3 shadow-soft">
          <CheckCircle2 size={16} className="text-sage" />
          You&apos;re all caught up - nothing from overnight needs attention.
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowReviewed((v) => !v)}
            className="flex items-center gap-1.5 px-1 py-1 text-label font-medium text-ink-3 transition-colors hover:text-ink"
          >
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              className={`transition-transform ${showReviewed ? "" : "-rotate-90"}`}
            />
            Reviewed ({reviewed.length})
          </button>
          {showReviewed && (
            <div className="mt-1 overflow-hidden rounded-2xl border border-tan-soft bg-paper shadow-soft">
              {reviewed.map((call) => (
                <CallRow
                  key={call.id}
                  call={call}
                  expanded={expandedId === call.id}
                  muted
                  onToggle={toggle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
