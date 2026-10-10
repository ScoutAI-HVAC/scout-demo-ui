"use client";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { shopTradeCopy, type ShopTrade } from "@/lib/shop-trades";
type Reason = "repair" | "maintenance" | "estimate" | "emergency";
type Behavior = "book" | "transfer" | "message";
interface Row {
  reason: Reason;
  behavior: Behavior;
  jobTypeId?: string;
  jobTypeName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
  arrivalWindowMinutes?: number;
  techIds?: string[];
  commercial?: {
    jobTypeId?: string;
    jobTypeName?: string;
    businessUnitId?: string;
    businessUnitName?: string;
  };
  suggested?: boolean;
}
function storedRow(row: Row): Row {
  const stored = { ...row };
  delete stored.suggested;
  return stored;
}
const COMMERCIAL = /commercial|business|industrial/i;
interface RosterTech {
  id: string;
  name: string;
  active: boolean;
  phone?: string;
}
interface Options {
  supported: boolean;
  adapter: string | null;
  jobTypes: Array<{
    id: string;
    name: string;
  }>;
  businessUnits: Array<{
    id: string;
    name: string;
  }>;
}
const REASONS: Array<{
  reason: Reason;
  label: string;
  match: RegExp;
}> = [
  {
    reason: "repair",
    label: "Repair",
    match: /repair|service|demand|no.?cool|no.?heat/i,
  },
  {
    reason: "maintenance",
    label: "Maintenance",
    match: /mainten|tune|pm\b|precision|seasonal/i,
  },
  {
    reason: "estimate",
    label: "Estimate",
    match: /estimate|install|replace|sales|quote|comfort/i,
  },
  {
    reason: "emergency",
    label: "Emergency",
    match: /emergency|urgent|after.?hours/i,
  },
];
const DEFAULT_BEHAVIOR: Record<Reason, Behavior> = {
  repair: "book",
  maintenance: "book",
  estimate: "book",
  emergency: "book",
};
const WINDOW_CHOICES = [
  { minutes: 0, label: "No promised window" },
  { minutes: 60, label: "1 hour window" },
  { minutes: 120, label: "2 hour window" },
  { minutes: 180, label: "3 hour window" },
  { minutes: 240, label: "4 hour window" },
];
export function BookingMapSection({
  addToast,
  trade,
}: {
  trade?: ShopTrade;
  addToast?: (kind: "success" | "error", message: string) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [revision, setRevision] = useState<string | null>(null);
  const [loadedRows, setLoadedRows] = useState(false);
  const [savedEmpty, setSavedEmpty] = useState(false);
  const [hasBookingWindows, setHasBookingWindows] = useState(false);
  const [roster, setRoster] = useState<RosterTech[] | null>(null);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [phonesDirty, setPhonesDirty] = useState(false);
  const [savingPhones, setSavingPhones] = useState(false);
  const [phonesMessage, setPhonesMessage] = useState<string | null>(null);
  const savePhones = async () => {
    setSavingPhones(true);
    setPhonesMessage(null);
    try {
      const technicianPhones = (roster ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        phone: phones[t.id] ?? t.phone ?? "",
      }));
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ technicianPhones }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Save failed (${res.status}).`);
      }
      setPhonesDirty(false);
      setPhonesMessage("Saved. The next booking texts these numbers.");
    } catch (err) {
      setPhonesMessage((err as Error).message);
    } finally {
      setSavingPhones(false);
    }
  };
  const [uniformJobTypeId, setUniformJobTypeId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/settings/booking-options", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as
        | (Options & {
            error?: string;
          })
        | null;
      if (!res.ok || !body) {
        throw new Error(body?.error ?? "The scheduling scan failed. Try again.");
      }
      setOptions(body);
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setScanning(false);
    }
  }, []);
  useEffect(() => {
    void scan();
    void (async () => {
      try {
        const res = await fetch("/api/technicians", { cache: "no-store" });
        const body = (await res.json()) as {
          technicians?: RosterTech[];
          crmReachable?: boolean;
        };
        setRoster(
          Array.isArray(body.technicians)
            ? body.technicians.filter((t) => t && typeof t.id === "string")
            : [],
        );
      } catch {
        setRoster([]);
      }
    })();
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const body = (await res.json()) as {
          booking?: {
            rows?: Row[];
            revision?: string;
            uniformJobTypeId?: string;
          };
          bookingWindows?: unknown[];
        };
        setHasBookingWindows((body.bookingWindows?.length ?? 0) > 0);
        const saved = body.booking?.rows ?? [];
        setRevision(body.booking?.revision ?? null);
        setUniformJobTypeId(body.booking?.uniformJobTypeId || undefined);
        setSavedEmpty(saved.length === 0 && !body.booking?.uniformJobTypeId);
        setRows(
          REASONS.map(({ reason }) => {
            const existing = saved.find((r) => r.reason === reason);
            return existing ?? { reason, behavior: DEFAULT_BEHAVIOR[reason] };
          }),
        );
      } catch {
        setRows(REASONS.map(({ reason }) => ({ reason, behavior: DEFAULT_BEHAVIOR[reason] })));
      } finally {
        setLoadedRows(true);
      }
    })();
  }, [scan]);
  useEffect(() => {
    if (!options?.jobTypes.length || !loadedRows || uniformJobTypeId) return;
    setRows((cur) =>
      cur.map((row) => {
        if (row.jobTypeId || row.behavior !== "book") return row;
        const spec = REASONS.find((r) => r.reason === row.reason);
        const hit =
          spec && options.jobTypes.find((t) => spec.match.test(t.name) && !COMMERCIAL.test(t.name));
        return hit ? { ...row, jobTypeId: hit.id, jobTypeName: hit.name, suggested: true } : row;
      }),
    );
  }, [options, loadedRows, uniformJobTypeId]);
  const setRow = (reason: Reason, patch: Partial<Row>) => {
    const picked = "jobTypeId" in patch ? { suggested: false } : {};
    setRows((cur) => cur.map((r) => (r.reason === reason ? { ...r, ...patch, ...picked } : r)));
    setDirty(true);
    setSaveError(null);
  };
  const blockers = uniformJobTypeId
    ? []
    : rows.filter((r) => r.behavior === "book" && !r.jobTypeId);
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          booking: {
            rows: rows.map(storedRow),
            ...(revision ? { revision } : {}),
            uniformJobTypeId: uniformJobTypeId ?? "",
            uniformJobTypeName: uniformJobTypeId
              ? (options?.jobTypes.find((t) => t.id === uniformJobTypeId)?.name ?? "")
              : "",
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Save failed (${res.status}). Try again.`);
      }
      const saved = (await res.json().catch(() => null)) as {
        settings?: {
          booking?: {
            revision?: string;
          };
        };
      } | null;
      if (saved?.settings?.booking?.revision) {
        setRevision(saved.settings.booking.revision);
      }
      setDirty(false);
      setSavedEmpty(false);
      setRows((cur) => cur.map(storedRow));
      addToast?.("success", "Booking Map saved. Scout books with these settings now.");
    } catch (err) {
      setSaveError((err as Error).message);
      addToast?.("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const selectCls = "field w-full px-3 py-2";
  return (
    <div className="space-y-6">
      <div className="sm:pr-10">
        <h2 className="text-title font-semibold text-ink">Booking Map</h2>
        <p className="mt-1 text-body text-ink-3">
          Where Scout books each kind of call. Every dropdown is pulled live from the shop&apos;s
          own CRM, so the choices below are their real job types and calendars. With no external CRM
          connected, treat any leftover lists as unavailable — do not configure production booking
          against an empty or local adapter.
        </p>
      </div>

      {scanning ? (
        <p className="flex items-center gap-2 text-body text-ink-3">
          <Loader2 size={14} className="animate-spin" />
          Reading the CRM&apos;s scheduling setup…
        </p>
      ) : scanError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-golden-tint px-4 py-3">
          <AlertCircle size={16} className="shrink-0 text-copper" />
          <p className="min-w-[12rem] flex-1 text-body text-ink-2">{scanError}</p>
          <button
            type="button"
            onClick={() => void scan()}
            className="flex min-h-9 items-center gap-1.5 rounded-pill bg-paper px-3.5 text-label font-semibold text-ink hover:bg-tan-soft"
          >
            <RefreshCw size={13} />
            Re-scan
          </button>
        </div>
      ) : options && !options.supported ? (
        <p className="rounded-2xl bg-paper-2 px-4 py-3 text-body text-ink-2">
          This CRM doesn&apos;t expose its scheduling setup yet, so Scout takes a message for
          anything it can&apos;t place. The map lights up as soon as the integration supports it.
        </p>
      ) : options && options.jobTypes.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper-2 px-4 py-3">
          <p className="min-w-[12rem] flex-1 text-body text-ink-3">
            The CRM answered but has no job types yet. Add them in the CRM, then re-scan.
          </p>
          <button
            type="button"
            onClick={() => void scan()}
            className="flex min-h-9 items-center gap-1.5 rounded-pill bg-paper px-3.5 text-label font-semibold text-ink hover:bg-tan-soft"
          >
            <RefreshCw size={13} />
            Re-scan
          </button>
        </div>
      ) : options ? (
        <>
          {savedEmpty && (
            <div className="flex items-start gap-3 rounded-2xl bg-golden-tint px-4 py-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-copper" />
              <p className="text-body text-ink-2">
                This map isn&apos;t saved yet, so Scout books without it. The job types below are
                suggestions matched by name - check them, then save.
              </p>
            </div>
          )}
          <div className="mb-3 rounded-2xl bg-paper-2 p-4">
            <label className="flex flex-wrap items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(uniformJobTypeId)}
                onChange={(e) => {
                  if (e.target.checked) {
                    const suggested =
                      options.jobTypes.find(
                        (t) => /service/i.test(t.name) && !COMMERCIAL.test(t.name),
                      ) ?? options.jobTypes[0];
                    setUniformJobTypeId(suggested?.id);
                  } else {
                    setUniformJobTypeId(undefined);
                  }
                  setDirty(true);
                  setSaveError(null);
                }}
                className="h-4 w-4 accent-terracotta"
              />
              <span className="text-body font-semibold text-ink">
                Book everything as one job type
              </span>
              {uniformJobTypeId && (
                <select
                  aria-label="The job type everything books as"
                  value={uniformJobTypeId}
                  onChange={(e) => {
                    setUniformJobTypeId(e.target.value || undefined);
                    setDirty(true);
                    setSaveError(null);
                  }}
                  className="field px-3 py-1.5 text-label font-semibold"
                >
                  {options.jobTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <p className="mt-2 text-label text-ink-3">
              {uniformJobTypeId
                ? "Every call that books lands on this one type. The caller's own words still go on the job, and an emergency still books as urgent - only the label is shared."
                : "Most shops file every visit the same way and let the technician sort it out on site. Turn this on and you pick the type once instead of per row."}
            </p>
          </div>
          <div className="space-y-3">
            {hasBookingWindows && (
              <p className="text-label text-ink-3">
                Arrival window: not used. Your booking windows on the Phone tab set the times Scout
                offers.
              </p>
            )}
            {rows.map((row) => {
              const spec = REASONS.find((r) => r.reason === row.reason);
              if (!spec) return null;
              return (
                <div key={row.reason} className="rounded-2xl bg-paper-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-body font-semibold text-ink">{spec.label}</span>
                      <span className="ml-2 text-label text-ink-3">
                        {shopTradeCopy(trade).bookingHints[spec.reason]}
                      </span>
                    </div>
                    <select
                      aria-label={`What Scout does for ${spec.label}`}
                      value={row.behavior}
                      onChange={(e) => setRow(row.reason, { behavior: e.target.value as Behavior })}
                      className="field px-3 py-1.5 text-label font-semibold"
                    >
                      <option value="book">Book it</option>
                      <option value="transfer">Transfer the call</option>
                      <option value="message">Take a message</option>
                    </select>
                  </div>
                  {row.behavior === "transfer" && (
                    <p className="mt-2 text-label text-ink-3">
                      Transferring needs a transfer number on the Phone tab. Without one, Scout
                      takes a message for these calls instead.
                    </p>
                  )}

                  {row.behavior === "book" && (
                    <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className={uniformJobTypeId ? "hidden" : "block"}>
                          <span className="mb-1 block text-label text-ink-3">Job type</span>
                          <select
                            aria-label={`Job type for ${spec.label}`}
                            value={row.jobTypeId ?? ""}
                            onChange={(e) => {
                              const hit = options.jobTypes.find((t) => t.id === e.target.value);
                              setRow(row.reason, {
                                jobTypeId: hit?.id,
                                jobTypeName: hit?.name,
                              });
                            }}
                            className={selectCls}
                          >
                            <option value="">Choose…</option>
                            {row.jobTypeId &&
                              !options.jobTypes.some((t) => t.id === row.jobTypeId) && (
                                <option value={row.jobTypeId}>
                                  {row.jobTypeName ?? row.jobTypeId} (no longer in the CRM)
                                </option>
                              )}
                            {options.jobTypes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          {row.suggested && (
                            <span className="mt-1 block text-label text-copper">
                              Suggested - not saved
                            </span>
                          )}
                        </label>
                        {options.businessUnits.length > 0 && (
                          <label className="block">
                            <span className="mb-1 block text-label text-ink-3">Calendar</span>
                            <select
                              aria-label={`Calendar for ${spec.label}`}
                              value={row.businessUnitId ?? ""}
                              onChange={(e) => {
                                const hit = options.businessUnits.find(
                                  (u) => u.id === e.target.value,
                                );
                                setRow(row.reason, {
                                  businessUnitId: hit?.id,
                                  businessUnitName: hit?.name,
                                });
                              }}
                              className={selectCls}
                            >
                              <option value="">CRM default</option>
                              {row.businessUnitId &&
                                !options.businessUnits.some((u) => u.id === row.businessUnitId) && (
                                  <option value={row.businessUnitId}>
                                    {row.businessUnitName ?? row.businessUnitId} (no longer in the
                                    CRM)
                                  </option>
                                )}
                              {options.businessUnits.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="block">
                          <span className="mb-1 block text-label text-ink-3">Arrival window</span>
                          <select
                            aria-label={`Arrival window for ${spec.label}`}
                            value={row.arrivalWindowMinutes ?? 0}
                            onChange={(e) =>
                              setRow(row.reason, {
                                arrivalWindowMinutes: Number(e.target.value) || undefined,
                              })
                            }
                            className={selectCls}
                          >
                            {WINDOW_CHOICES.map((w) => (
                              <option key={w.minutes} value={w.minutes}>
                                {w.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <fieldset className="mt-3">
                        <legend className="mb-1 block text-label text-ink-3">
                          Technicians
                          <span className="ml-1 text-ink-4">
                            {(row.techIds?.length ?? 0) === 0
                              ? "- any available"
                              : `- only these ${row.techIds?.length}`}
                          </span>
                        </legend>
                        {roster === null ? (
                          <p className="text-label text-ink-4">Loading your technicians…</p>
                        ) : roster.length === 0 ? (
                          <p className="text-label text-ink-4">
                            No technicians came back from your CRM, so this books with anyone
                            available.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {roster
                              .filter((t) => t.active !== false || row.techIds?.includes(t.id))
                              .map((t) => {
                                const on = row.techIds?.includes(t.id) ?? false;
                                return (
                                  <label
                                    key={t.id}
                                    className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium ${on ? "bg-terracotta-tint text-ink" : "bg-paper text-ink-2"}`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="accent-terracotta"
                                      checked={on}
                                      aria-label={`${t.name || t.id} takes ${spec.label}`}
                                      onChange={() => {
                                        const cur = row.techIds ?? [];
                                        setRow(row.reason, {
                                          techIds: on
                                            ? cur.filter((id) => id !== t.id)
                                            : [...cur, t.id],
                                        });
                                      }}
                                    />
                                    {t.name || t.id}
                                  </label>
                                );
                              })}
                          </div>
                        )}
                      </fieldset>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-label text-ink-3">
                            Commercial callers book onto
                          </span>
                          <select
                            aria-label={`Commercial job type for ${spec.label}`}
                            value={row.commercial?.jobTypeId ?? ""}
                            onChange={(e) => {
                              const hit = options.jobTypes.find((t) => t.id === e.target.value);
                              setRow(row.reason, {
                                commercial: hit
                                  ? { ...row.commercial, jobTypeId: hit.id, jobTypeName: hit.name }
                                  : undefined,
                              });
                            }}
                            className={selectCls}
                          >
                            <option value="">Same as above</option>
                            {options.jobTypes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {options.businessUnits.length > 0 && row.commercial?.jobTypeId && (
                          <label className="block">
                            <span className="mb-1 block text-label text-ink-3">
                              Commercial calendar
                            </span>
                            <select
                              aria-label={`Commercial calendar for ${spec.label}`}
                              value={row.commercial?.businessUnitId ?? ""}
                              onChange={(e) => {
                                const hit = options.businessUnits.find(
                                  (u) => u.id === e.target.value,
                                );
                                setRow(row.reason, {
                                  commercial: {
                                    ...row.commercial,
                                    businessUnitId: hit?.id,
                                    businessUnitName: hit?.name,
                                  },
                                });
                              }}
                              className={selectCls}
                            >
                              <option value="">Same as above</option>
                              {options.businessUnits.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {roster && roster.length > 0 && (
            <div className="rounded-2xl bg-paper-2 p-4">
              <p className="text-body font-semibold text-ink">Technician phones</p>
              <p className="mb-3 text-label text-ink-3">
                The mobile each technician gets their booking text on. Filled from your CRM where it
                has one; add or correct a number here.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {roster.map((t) => (
                  <label key={t.id} className="block">
                    <span className="mb-1 block text-label text-ink-3">{t.name || t.id}</span>
                    <input
                      type="tel"
                      aria-label={`Phone for ${t.name || t.id}`}
                      value={phones[t.id] ?? t.phone ?? ""}
                      placeholder="(555) 555-0100"
                      onChange={(e) => {
                        setPhones((cur) => ({ ...cur, [t.id]: e.target.value }));
                        setPhonesDirty(true);
                        setPhonesMessage(null);
                      }}
                      className="field w-full py-2"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end gap-3">
                {phonesMessage && <span className="text-label text-ink-3">{phonesMessage}</span>}
                <button
                  type="button"
                  onClick={() => void savePhones()}
                  disabled={!phonesDirty || savingPhones}
                  className="rounded-full bg-terracotta px-4 py-2 text-label font-semibold text-paper disabled:opacity-50"
                >
                  {savingPhones ? "Saving…" : "Save technician phones"}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || (!dirty && !savedEmpty) || blockers.length > 0}
              className="rounded-pill bg-terracotta px-5 py-2.5 text-body font-semibold text-on-accent transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:bg-tan"
            >
              {saving ? "Saving…" : "Save Booking Map"}
            </button>
            <button
              type="button"
              onClick={() => void scan()}
              className="flex min-h-9 items-center gap-1.5 rounded-pill bg-paper-2 px-3.5 text-label font-semibold text-ink hover:bg-tan-soft"
            >
              <RefreshCw size={13} />
              Re-scan CRM
            </button>
            {blockers.length > 0 && (
              <p className="text-label text-copper">
                Pick a job type for {blockers.map((b) => b.reason).join(", ")} - or switch those
                rows to transfer or take a message.
              </p>
            )}
            {saveError && <p className="text-label text-alarm">{saveError}</p>}
          </div>
        </>
      ) : null}
    </div>
  );
}
