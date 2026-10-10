"use client";
import { CalendarCheck, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import { formatPhone } from "@/lib/format";
import { CAMPAIGN_BUTTONS } from "../campaign-controls";
export interface FlowBookingConfig {
  enabled: boolean;
  techIds: string[];
  anyTech?: boolean;
  jobType: string;
}
interface RosterTech {
  id: string;
  name: string;
  phone: string;
  active?: boolean;
  externalId?: string;
}
const JOB_TYPES = [
  { value: "repair", label: "Repair" },
  { value: "maintenance", label: "Maintenance" },
  { value: "install", label: "Install" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "estimate", label: "Estimate" },
] as const;
function techLabel(tech: { name?: string; phone?: string }): string {
  const name = (tech.name ?? "").trim();
  if (name) {
    return name;
  }
  const phone = (tech.phone ?? "").trim();
  if (phone) {
    return `The technician at ${formatPhone(phone)}`;
  }
  return "An unnamed technician";
}
export function BookingsPanel({
  flowId,
  state,
  booking,
  onSaved,
}: {
  flowId: string;
  state: string;
  booking: FlowBookingConfig | undefined;
  onSaved: () => Promise<unknown>;
}) {
  const { displayText } = useCampaignPhonePrivacy();
  const editable = state === "draft" || state === "paused";
  const [roster, setRoster] = useState<RosterTech[] | null>(null);
  const [rosterFailed, setRosterFailed] = useState(false);
  const [enabled, setEnabled] = useState(booking?.enabled ?? false);
  const [techIds, setTechIds] = useState<string[]>(booking?.techIds ?? []);
  const [anyTech, setAnyTech] = useState(booking ? booking.anyTech === true : true);
  const [jobType, setJobType] = useState(booking?.jobType ?? "maintenance");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRoster = async () => {
    setRosterFailed(false);
    try {
      const res = await fetch("/api/technicians", { cache: "no-store" });
      const body = (await res.json()) as {
        technicians?: RosterTech[];
        crmReachable?: boolean;
      };
      if (!res.ok || body.crmReachable === false) {
        setRosterFailed(true);
        setRoster([]);
        return;
      }
      setRoster((body.technicians ?? []).filter((t) => t.active !== false));
    } catch {
      setRosterFailed(true);
      setRoster([]);
    }
  };
  useEffect(() => {
    void loadRoster();
  }, []);
  const toggleTech = (id: string) => {
    setDirty(true);
    setTechIds((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]));
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(flowId)}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          booking: enabled
            ? anyTech
              ? { enabled: true, anyTech: true, techIds: [], jobType }
              : { enabled: true, techIds, jobType }
            : null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          problems?: Array<{
            problem: string;
          }>;
        };
        setError(
          body.problems?.map((p) => p.problem).join("; ") ?? body.error ?? "Could not save.",
        );
        return;
      }
      setDirty(false);
      await onSaved();
    } finally {
      setSaving(false);
    }
  };
  const rosterIds = new Set((roster ?? []).flatMap((t) => [t.id, t.externalId ?? t.id]));
  const missingSelected = roster === null ? [] : techIds.filter((id) => !rosterIds.has(id));
  const bookingOn = editable ? enabled : booking?.enabled === true;
  const selectionEmpty = enabled && !anyTech && techIds.length === 0;
  const selectedNames =
    roster === null
      ? []
      : techIds
          .map((id) => roster.find((t) => (t.externalId ?? t.id) === id || t.id === id))
          .filter((t): t is RosterTech => Boolean(t))
          .map((t) => displayText(techLabel(t)));
  return (
    <section className="mt-7">
      <div className="mb-3">
        <h2 className="text-body-lg font-semibold text-ink">Bookings</h2>
        <p className="text-body text-ink-3">
          {bookingOn
            ? "When a customer says yes, Scout puts the visit on the calendar."
            : "When a customer says yes, Scout passes the booking to you."}
        </p>
      </div>
      <div>
        <div className="mb-5 rounded-2xl bg-paper-2 p-4">
          <h3 className="text-body font-semibold text-ink">
            Your techs. Your calendar. Scout handles the back-and-forth.
          </h3>
          <ol className="mt-3 grid gap-3 text-body text-ink-2 sm:grid-cols-3">
            <li>
              <strong className="block text-ink">1. Pick the crew</strong>Let any available tech
              take it, or choose the exact techs for this kind of job.
            </li>
            <li>
              <strong className="block text-ink">2. Check real openings</strong>Scout checks
              availability for those technicians against your booking rules.
            </li>
            <li>
              <strong className="block text-ink">3. Recheck, then book</strong>After the customer
              chooses, Scout rechecks the opening before submitting the visit to your CRM.
            </li>
          </ol>
          <p className="mt-3 text-label text-ink-3">
            Availability depends on what your CRM can provide. This selection doesn't promise skill
            matching or travel-time routing.
          </p>
        </div>
        {!editable ? (
          <div className="flex items-start gap-2.5 text-body text-ink-2">
            <CalendarCheck size={16} className="mt-0.5 shrink-0 text-sage" />
            {booking?.enabled ? (
              <span>
                Scout books <span className="font-semibold">{booking.jobType}</span> visits for{" "}
                <span className="font-semibold">
                  {booking.anyTech
                    ? "any available tech"
                    : selectedNames.length
                      ? selectedNames.join(", ")
                      : "the techs you picked"}
                </span>
                .
                {state === "live"
                  ? ` Tap ${CAMPAIGN_BUTTONS.stop} to pause the agent and change this.`
                  : null}
              </span>
            ) : (
              <span>
                Off - replies that want to book come to you instead.
                {state === "live"
                  ? ` Tap ${CAMPAIGN_BUTTONS.stop} to pause the agent and turn it on.`
                  : null}
              </span>
            )}
          </div>
        ) : (
          <>
            <label className="flex w-fit cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-terracotta/70">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  setDirty(true);
                }}
                className="sr-only"
              />

              <span
                aria-hidden="true"
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? "bg-sage" : "bg-ink/15"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-soft transition-transform duration-200 ease-[var(--ease-ios)] motion-reduce:transition-none ${enabled ? "translate-x-5" : ""}`}
                />
              </span>
              <span className="text-body-lg font-semibold text-ink">Scout books the visit</span>
              <span className="text-body text-ink-3">
                {enabled ? "" : "Off - booking asks come to you as texts."}
              </span>
            </label>

            {enabled ? (
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <div className="mb-2 text-body font-semibold text-ink-2">
                    Who takes these visits
                  </div>
                  <div className="mb-2.5 flex flex-wrap gap-2" role="radiogroup">
                    {[
                      { any: true, label: "Any available tech" },
                      { any: false, label: "Only these techs" },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        role="radio"
                        aria-checked={anyTech === option.any}
                        onClick={() => {
                          setAnyTech(option.any);
                          setDirty(true);
                        }}
                        className={`flex min-h-10 items-center gap-1.5 rounded-full px-4 text-body ${
                          anyTech === option.any
                            ? "bg-sage-tint font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--color-sage)]"
                            : "bg-paper-2 text-ink-2"
                        }`}
                      >
                        {anyTech === option.any ? <Check size={13} className="text-sage" /> : null}
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {anyTech ? (
                    <div className="text-body text-ink-3">
                      Scout offers openings from every active tech on your calendar, including
                      anyone you add later, and spreads the visits to whoever is lightest that day.
                    </div>
                  ) : roster === null ? (
                    <div className="text-body text-ink-3">Loading your techs…</div>
                  ) : rosterFailed ? (
                    <div className="text-body text-ink-3">
                      Couldn&apos;t load the tech list from your CRM.{" "}
                      <button type="button" onClick={() => void loadRoster()} className="underline">
                        Try again
                      </button>
                    </div>
                  ) : roster.length === 0 && missingSelected.length === 0 ? (
                    <div className="text-body text-ink-3">
                      No techs found - add your team in Settings or your CRM first.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {roster.map((tech) => {
                        const value = tech.externalId ?? tech.id;
                        const selected = techIds.includes(value) || techIds.includes(tech.id);
                        const stored =
                          techIds.includes(tech.id) && !techIds.includes(value) ? tech.id : value;
                        return (
                          <button
                            key={tech.id}
                            type="button"
                            onClick={() => toggleTech(stored)}
                            aria-pressed={selected}
                            className={`flex min-h-10 items-center gap-1.5 rounded-full px-4 text-body ${
                              selected
                                ? "bg-sage-tint font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--color-sage)]"
                                : "bg-paper-2 text-ink-2"
                            }`}
                          >
                            {selected ? <Check size={13} className="text-sage" /> : null}
                            {displayText(techLabel(tech))}
                          </button>
                        );
                      })}
                      {missingSelected.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleTech(id)}
                          className="flex min-h-10 items-center gap-1.5 rounded-full bg-golden-tint px-4 text-body text-ink"
                        >
                          <Check size={13} />
                          A tech no longer on the roster - tap to remove
                        </button>
                      ))}
                    </div>
                  )}
                  {selectionEmpty ? (
                    <div className="mt-2 text-body text-ink-3">
                      Pick at least one tech to take these bookings.
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="mb-2 text-body font-semibold text-ink-2">
                    What kind of job Scout books
                  </div>
                  <select
                    value={jobType}
                    onChange={(e) => {
                      setJobType(e.target.value);
                      setDirty(true);
                    }}
                    className="select-warm min-h-11 max-w-xs"
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {error ? <div className="mt-3 text-body text-alarm">{error}</div> : null}
            {dirty ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || selectionEmpty}
                  className="min-h-11 rounded-full bg-sage px-5 text-body font-semibold text-on-accent disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save bookings"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
