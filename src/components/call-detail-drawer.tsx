"use client";
import {
  X,
  Check,
  MapPin,
  Clock,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Briefcase,
  Sparkles,
  Database,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PROVIDER_LABELS, type ProviderId } from "@/components/crm-connection-section";
import { CustomerProvenanceBanner, provenanceOf } from "@/components/customer-provenance";
import OutcomeBadge from "@/components/outcome-badge";
import { useShopClock } from "@/components/shop-clock";
import {
  fetchCall,
  fetchCustomerById,
  fetchCustomerByPhone,
  fetchJobById,
  linkCallToCustomer,
  type Call,
  type DrawerCustomer,
  type DrawerJob,
} from "@/lib/api";
import { features } from "@/lib/features";
import { formatDateTime, formatPhone, resolvedViaLabel } from "@/lib/format";
import { humanizeToken } from "@/lib/pro-case";
interface Props {
  callId: string | null;
  onClose: () => void;
  onResolveCallback?: (callId: string) => void;
}
export default function CallDetailDrawer({ callId, onClose, onResolveCallback }: Props) {
  const clock = useShopClock();
  const drawerRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [customer, setCustomer] = useState<DrawerCustomer | null>(null);
  const [customerResolved, setCustomerResolved] = useState(false);
  const [job, setJob] = useState<DrawerJob | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingCustomerId, setLinkingCustomerId] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [recordingGone, setRecordingGone] = useState(false);
  useEffect(() => {
    if (!callId) {
      queueMicrotask(() => {
        setCall(null);
        setCustomer(null);
        setCustomerResolved(false);
        setJob(null);
        setJobLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setCustomer(null);
      setCustomerResolved(false);
      setJob(null);
      setJobLoading(false);
      setMatchError(null);
      setRecordingGone(false);
      pendingSeek.current = null;
      setPlaybackNotice(null);
      fetchCall(callId)
        .then((data) => {
          if (cancelled) return;
          setCall(data);
          if (features.callEnrichment && customerMatchExpected(data)) {
            void (async () => {
              let c: DrawerCustomer | null = data.customerId
                ? await fetchCustomerById(data.customerId)
                : null;
              if (!c && data.callerPhone) {
                c = await fetchCustomerByPhone(data.callerPhone);
              }
              if (!cancelled) {
                setCustomer(c);
                setCustomerResolved(true);
              }
            })();
          } else {
            setCustomerResolved(true);
          }
          if (features.callEnrichment && data.jobId) {
            setJobLoading(true);
            void fetchJobById(data.jobId)
              .then((j) => {
                if (!cancelled) setJob(j);
              })
              .finally(() => {
                if (!cancelled) setJobLoading(false);
              });
          }
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [callId]);
  function seekRecording(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaybackNotice(null);
    if (audio.readyState === 0) {
      pendingSeek.current = seconds;
      return;
    }
    pendingSeek.current = null;
    audio.currentTime = Number.isFinite(audio.duration)
      ? Math.min(seconds, Math.max(0, audio.duration - 0.01))
      : seconds;
    void audio
      .play()
      .catch(() => setPlaybackNotice("Press play on the recording to listen from here."));
  }
  useEffect(() => {
    if (!callId) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [callId, onClose]);
  const open = callId !== null;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], audio[controls], input:not([disabled]), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === drawerRef.current ||
          !drawerRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !drawerRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keepFocus);
    return () => {
      document.removeEventListener("keydown", keepFocus);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);
  if (!open) return null;
  const chooseCustomer = async (customerId: string) => {
    if (!call) return;
    setLinkingCustomerId(customerId);
    setMatchError(null);
    try {
      const updated = await linkCallToCustomer(call.id, customerId);
      setCall(updated);
      setCustomer(await fetchCustomerById(customerId));
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Couldn't link this customer");
    } finally {
      setLinkingCustomerId(null);
    }
  };
  return (
    <>
      <div
        onClick={onClose}
        className="animate-backdropFade fixed inset-0 z-[60] m-0 bg-black/40"
        aria-hidden="true"
      />

      <aside
        ref={drawerRef}
        tabIndex={-1}
        className="quiet-focus animate-drawerRight fixed top-0 right-0 z-[60] flex h-dvh w-full max-w-2xl flex-col overflow-hidden bg-paper shadow-lift sm:rounded-l-[28px]"
        role="dialog"
        aria-modal="true"
        aria-label="Call detail"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[calc(1rem+var(--safe-t))] pb-3 sm:px-6 sm:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-terracotta-tint text-terracotta-deep">
              {call?.direction === "outbound" ? (
                <PhoneOutgoing size={20} strokeWidth={1.8} />
              ) : (
                <PhoneIncoming size={20} strokeWidth={1.8} />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-title font-semibold tracking-[-0.01em] text-ink">
                {call?.callerName || customer?.name || "Unknown caller"}
              </h2>
              <p className="truncate text-body text-ink-3">{formatPhone(call?.callerPhone)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2 transition-colors hover:text-ink active:bg-tan-soft"
            aria-label="Close drawer"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[calc(1.5rem+var(--safe-b))] sm:px-6">
          {loading && (
            <div className="flex h-32 items-center justify-center text-body text-ink-4">
              Loading call detail…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm">{error}</div>
          )}

          {call && !loading && (
            <div className="space-y-7">
              {call.needsAttention && onResolveCallback && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-golden-tint py-2 pr-2 pl-4">
                  <p className="text-body font-medium text-ink">
                    This caller is still waiting on a callback.
                  </p>
                  <button
                    onClick={() => {
                      onResolveCallback(call.id);
                      setCall({
                        ...call,
                        needsAttention: undefined,
                        callbackResolvedAt: new Date().toISOString(),
                        callbackResolvedVia: "manual",
                      });
                    }}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-paper px-4 text-body font-semibold text-sage-deep transition-colors hover:bg-sage-tint active:bg-sage-tint"
                  >
                    <Check size={16} strokeWidth={1.8} />
                    Mark handled
                  </button>
                </div>
              )}
              {call.callbackResolvedAt && (
                <p className="flex items-center gap-1.5 text-body font-medium text-sage-deep">
                  <Check size={16} strokeWidth={1.8} />
                  Callback handled {formatDateTime(call.callbackResolvedAt, clock)} ·{" "}
                  {resolvedViaLabel(call.callbackResolvedVia)}
                </p>
              )}

              {call.outcome === "unresolved" && call.unresolvedReason && (
                <p className="text-body-lg text-ink-2">
                  <span className="font-semibold text-lavender">Left open:</span>{" "}
                  {call.unresolvedReason}
                </p>
              )}
              <BookingProof call={call} />

              <section aria-label="Call overview" className="grid grid-cols-2 gap-2 text-body">
                <Meta
                  icon={<Clock size={16} strokeWidth={1.8} />}
                  label="Started"
                  value={formatDateTime(call.startedAt, clock)}
                />
                {call.outcome && (
                  <Meta
                    icon={<Sparkles size={16} strokeWidth={1.8} />}
                    label="Outcome"
                    value={<OutcomeBadge outcome={call.outcome} />}
                  />
                )}

                {call.status === "failed" && (
                  <Meta
                    icon={<PhoneMissed size={16} strokeWidth={1.8} />}
                    label="Didn't connect"
                    value={
                      call.endedReason
                        ? humanizeToken(call.endedReason)
                        : "The call never connected"
                    }
                  />
                )}
                {features.callEnrichment && call.crmSync && (
                  <Meta
                    icon={<Database size={16} strokeWidth={1.8} />}
                    label="CRM handoff"
                    value={crmSyncLabel(call.crmSync)}
                    span={2}
                  />
                )}
                {(call.serviceAddress || call.address) && (
                  <Meta
                    icon={<MapPin size={16} strokeWidth={1.8} />}
                    label="Service location"
                    value={call.serviceAddress || call.address}
                    span={2}
                  />
                )}
              </section>

              {features.callEnrichment &&
                call.customerMatchStatus === "ambiguous" &&
                call.customerMatchCandidates &&
                call.customerMatchCandidates.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-center gap-2 text-body-lg font-semibold text-ink">
                      <User size={18} strokeWidth={1.8} />
                      Choose the customer
                    </div>
                    <div className="rounded-2xl bg-golden-tint p-3">
                      <p className="mb-3 px-1 text-body text-ink-2">
                        Scout found several close CRM records and did not guess.
                      </p>
                      <div className="space-y-2">
                        {call.customerMatchCandidates.map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            disabled={linkingCustomerId !== null}
                            onClick={() => void chooseCustomer(candidate.id)}
                            className="w-full rounded-xl bg-paper px-4 py-3 text-left transition-colors hover:bg-paper-2 disabled:opacity-60"
                          >
                            <div className="text-body font-semibold text-ink">{candidate.name}</div>
                            <div className="mt-0.5 text-label text-ink-3">
                              {[formatPhone(candidate.phone), candidate.email, candidate.address]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            {linkingCustomerId === candidate.id && (
                              <div className="mt-1 text-label text-copper">Linking…</div>
                            )}
                          </button>
                        ))}
                      </div>
                      {matchError && <p className="mt-2 text-label text-alarm">{matchError}</p>}
                    </div>
                  </section>
                )}

              {features.callEnrichment && (customer || customerMatchExpected(call)) && (
                <section>
                  <div className="mb-3 flex items-center gap-2 text-body-lg font-semibold text-ink">
                    <User size={18} strokeWidth={1.8} />
                    Customer
                  </div>
                  <CustomerProvenanceBanner provenance={provenanceOf(call.customerMatchStatus)} />
                  {customer ? (
                    <a
                      href={`/customers/${customer.id}`}
                      className="block rounded-2xl bg-paper-2 p-4 text-body text-ink-2 transition-colors hover:bg-tan-soft"
                    >
                      <div className="font-semibold text-ink">
                        {customer.name || formatPhone(customer.phone) || "Unnamed customer"}
                      </div>
                      {customer.phone && customer.name && (
                        <div className="mt-0.5 text-label text-ink-3">
                          {formatPhone(customer.phone)}
                        </div>
                      )}
                      {customer.address && (
                        <div className="mt-1 text-label text-ink-3">{customer.address}</div>
                      )}
                    </a>
                  ) : !customerResolved ? (
                    <div className="rounded-2xl bg-paper-2 px-4 py-3 text-body text-ink-3">
                      Loading customer…
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-paper-2 px-4 py-3 text-body text-ink-2">
                      <div className="font-semibold text-ink">
                        {call.callerName || formatPhone(call.callerPhone) || "Caller"}
                      </div>
                      {call.callerName && call.callerPhone && (
                        <div className="mt-0.5 text-label text-ink-3">
                          {formatPhone(call.callerPhone)}
                        </div>
                      )}
                      <div className="mt-1 text-label text-ink-4">
                        Full customer record couldn&rsquo;t be loaded from the CRM.
                      </div>
                    </div>
                  )}
                </section>
              )}

              {(job || call.jobId) && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-body-lg font-semibold text-ink">
                    <Briefcase size={18} strokeWidth={1.8} />
                    Booked Job
                  </h3>
                  {job ? (
                    <a
                      href={`/schedule?job=${job.id}`}
                      className="block rounded-2xl bg-paper-2 p-4 text-body text-ink-2 transition-colors hover:bg-tan-soft"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold capitalize text-ink">
                          {job.jobType || "Service call"}
                          {job.timeSlot ? ` - ${job.timeSlot}` : ""}
                        </div>
                        {job.status && (
                          <span className="rounded-full bg-paper px-2.5 py-0.5 text-label font-semibold text-ink-2">
                            {humanizeToken(job.status)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-label text-ink-3">
                        {[job.date, job.techName ? `with ${job.techName}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {job.customerName && (
                        <div className="mt-1 text-label text-ink-3">
                          {job.customerName}
                          {job.address ? ` - ${job.address}` : ""}
                        </div>
                      )}
                    </a>
                  ) : jobLoading ? (
                    <div className="rounded-2xl bg-paper-2 px-4 py-3 text-body text-ink-3">
                      Loading job details…
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-paper-2 px-4 py-3 text-body text-ink-3">
                      Booking recorded, but job details are currently unavailable.
                    </div>
                  )}
                </section>
              )}

              {features.callRecordings && call.recordingUrl && (
                <section>
                  <h3 className="mb-3 text-body-lg font-semibold text-ink">Recording</h3>
                  {recordingGone ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-paper-2 py-2 pr-2 pl-4 text-body text-ink-2">
                      <span>
                        Couldn&rsquo;t load this recording. It may have expired, or the connection
                        may have dropped.
                      </span>
                      <button
                        type="button"
                        onClick={() => setRecordingGone(false)}
                        className="min-h-11 flex-shrink-0 rounded-full bg-paper px-4 font-semibold text-ink transition-colors hover:bg-tan-soft active:bg-tan-soft"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    <audio
                      key={call.id}
                      ref={audioRef}
                      controls
                      src={`/api/calls/${encodeURIComponent(call.id)}/recording`}
                      className="w-full"
                      preload="metadata"
                      onError={() => setRecordingGone(true)}
                      onLoadedMetadata={() => {
                        if (pendingSeek.current !== null) seekRecording(pendingSeek.current);
                      }}
                    >
                      Your browser does not support audio playback.
                    </audio>
                  )}
                  {playbackNotice && (
                    <p role="status" className="mt-2 text-body text-ink-3">
                      {playbackNotice}
                    </p>
                  )}
                </section>
              )}

              {call.summary && (
                <section>
                  <h3 className="mb-2 text-body-lg font-semibold text-ink">
                    Scout&rsquo;s Summary
                  </h3>
                  <p className="whitespace-pre-wrap break-words text-body-lg leading-relaxed text-ink-2">
                    {call.summary}
                  </p>
                </section>
              )}

              {call.turns && call.turns.length > 0 && (
                <section>
                  <h3
                    id="call-transcript-heading"
                    className="mb-3 text-body-lg font-semibold text-ink"
                  >
                    Transcript
                  </h3>
                  {features.callRecordings && call.recordingUrl && !recordingGone && (
                    <p className="-mt-1 mb-3 text-body text-ink-3">
                      Tap a time to listen from that moment.
                    </p>
                  )}
                  <div
                    role="region"
                    aria-labelledby="call-transcript-heading"
                    tabIndex={0}
                    className="max-h-[min(26rem,55dvh)] space-y-0.5 overflow-y-auto rounded-2xl bg-paper-2/60 p-1.5"
                  >
                    {call.turns.map((turn, idx) => {
                      const isScout = turn.speaker === "scout";
                      const elapsed = transcriptTime(turn.timestamp, call.startedAt);
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 rounded-xl py-1.5 pr-1 pl-3 ${isScout ? "" : "bg-paper"}`}
                        >
                          <p className="min-w-0 flex-1 py-1 whitespace-pre-wrap break-words text-body leading-relaxed text-ink">
                            <span
                              className={`font-semibold ${isScout ? "text-terracotta-deep" : "text-ink"}`}
                            >
                              {isScout ? "Scout" : "Caller"}:{" "}
                            </span>
                            {turn.text}
                          </p>
                          {elapsed !== null &&
                            (features.callRecordings && call.recordingUrl && !recordingGone ? (
                              <button
                                type="button"
                                aria-label={`Play recording from ${elapsed}`}
                                onClick={() => {
                                  const [minutes, seconds] = elapsed.split(":").map(Number);
                                  seekRecording(minutes * 60 + seconds);
                                }}
                                className="min-h-11 min-w-11 shrink-0 rounded-full px-2 font-tabular text-label font-semibold text-sage-deep transition-colors hover:bg-sage-tint active:bg-sage-tint"
                              >
                                {elapsed}
                              </button>
                            ) : (
                              <span
                                className="shrink-0 px-2 pt-1.5 font-tabular text-label text-ink-3"
                                aria-label={`${elapsed} into the call`}
                              >
                                {elapsed}
                              </span>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {(!call.turns || call.turns.length === 0) && call.transcript && (
                <section>
                  <h3 className="mb-3 text-body-lg font-semibold text-ink">Transcript</h3>
                  <pre className="whitespace-pre-wrap break-words rounded-2xl bg-paper-2/60 p-4 font-sans text-body leading-relaxed text-ink-2">
                    {call.transcript}
                  </pre>
                </section>
              )}

              <CallEventsSection call={call} />

              {job?.notes && /from call\s+/i.test(job.notes) && (
                <p className="text-label text-ink-3">
                  Booked via Scout from call {call.id.slice(0, 8)}
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
function customerMatchExpected(call: Call): boolean {
  if (call.customerId) return true;
  return (
    Boolean(call.callerPhone) &&
    (call.customerMatchStatus === "exact_phone" ||
      call.customerMatchStatus === "matched" ||
      call.customerMatchStatus === "created")
  );
}
function Meta({
  icon,
  label,
  value,
  span,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  span?: number;
}) {
  return (
    <div className={`min-w-0 rounded-2xl bg-paper-2/60 p-4 ${span === 2 ? "col-span-2" : ""}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-body font-medium text-ink-3">
        {icon}
        {label}
      </div>
      <div className="break-words text-body font-medium text-ink">{value}</div>
    </div>
  );
}
function crmSyncLabel(sync: NonNullable<Call["crmSync"]>): string {
  const destination = sync.target
    ? ` ${PROVIDER_LABELS[sync.target as ProviderId] ?? humanizeToken(sync.target)}`
    : "";
  switch (sync.status) {
    case "synced":
      return `Saved to CRM${destination}`;
    case "unsupported":
      return sync.detail || "The connected CRM doesn't support saving call notes";
    case "no_anchor":
      return "Saved in Scout; no CRM customer or job was matched";
    case "failed":
      return sync.detail || "CRM handoff failed; the call remains saved in Scout";
    case "skipped":
      return sync.detail || "No CRM handoff was needed";
  }
}
function BookingProof({ call }: { call: Call }) {
  const clock = useShopClock();
  const proof = call.bookingProof;
  if (!proof && call.outcome !== "booked") return null;
  return (
    <section aria-label="Booking verification" className="rounded-2xl bg-sage-tint/70 p-4 sm:p-5">
      <h3 className="text-body-lg font-semibold text-ink">Booking details</h3>
      {proof?.state === "verified" ? (
        <>
          <p className="mt-0.5 text-body text-ink-3">
            Current CRM record · checked {formatDateTime(proof.checkedAt, clock)}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-body-lg text-ink">
            <div>
              <dt className="text-body text-ink-3">Date</dt>
              <dd>{proof.date}</dd>
            </div>
            <div>
              <dt className="text-body text-ink-3">Visit window</dt>
              <dd>{proof.timeSlot}</dd>
            </div>
            <div>
              <dt className="text-body text-ink-3">Status</dt>
              <dd>{humanizeToken(proof.status)}</dd>
            </div>
            <div>
              <dt className="text-body text-ink-3">Technician</dt>
              <dd>
                {proof.technicians.length
                  ? proof.technicians.map((t) => t.name || "Assigned technician").join(", ")
                  : "Not available"}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-2 text-body text-ink-2">
          {proof?.state === "pending"
            ? "The CRM accepted the request. Your office still needs to confirm the time and technician."
            : proof?.state === "unsupported"
              ? "Booking recorded. Check your CRM for the current appointment details."
              : proof
                ? "Booking recorded, but the current CRM details couldn't be verified."
                : "This call was marked booked. A linked CRM appointment isn't available to verify."}
        </p>
      )}
      {proof && (
        <p className="mt-3 break-all text-body text-ink-3">CRM job reference: {proof.jobId}</p>
      )}
    </section>
  );
}
function transcriptTime(timestamp: string | undefined, startedAt: string): string | null {
  if (!timestamp) return null;
  const seconds = Math.floor((Date.parse(timestamp) - Date.parse(startedAt)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function CallEventsSection({ call }: { call: Call }) {
  const clock = useShopClock();
  const labels: Record<NonNullable<Call["completedActions"]>[number]["kind"], string> = {
    booking_created: "Appointment created in CRM",
    booking_existing: "Existing appointment confirmed",
    request_created: "Booking request saved for the office",
    confirmation_sent: "Confirmation text sent",
    customer_text_sent: "Customer text sent",
    visit_rescheduled: "Appointment rescheduled in CRM",
    followup_requested: "Office follow-up requested",
  };
  const actions = (call.completedActions ?? []).filter((action) => labels[action.kind]);
  return (
    <section>
      <h3 className="mb-4 text-body-lg font-semibold text-ink">Call events</h3>
      {!actions.length && (
        <p className="mb-4 text-body text-ink-3">
          Detailed actions weren’t recorded for this call.
        </p>
      )}
      <ol className="ml-1 space-y-5 border-l-2 border-paper-2 pl-5 text-body text-ink-2">
        <li className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-tan"
          />
          <p className="text-body text-ink-3">{formatDateTime(call.startedAt, clock)}</p>
          <p className="mt-1 font-medium">Call started</p>
        </li>
        {[...actions]
          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
          .map((action, index) => (
            <li key={`${action.at}-${index}`} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-sage"
              />
              <p className="text-body text-ink-3">{formatDateTime(action.at, clock)}</p>
              <p className="mt-1 font-medium">{labels[action.kind]}</p>
              {action.reference && (
                <p className="mt-1 break-all text-body text-ink-3">
                  CRM reference: {action.reference}
                </p>
              )}
              {(action.kind === "confirmation_sent" || action.kind === "customer_text_sent") && (
                <p className="mt-1 text-body text-ink-3">
                  Accepted by the text provider. Delivery isn’t confirmed here.
                </p>
              )}
            </li>
          ))}
        {call.endedAt && (
          <li className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-tan"
            />
            <p className="text-body text-ink-3">{formatDateTime(call.endedAt, clock)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-medium">
              Call ended
              {call.outcome && <OutcomeBadge outcome={call.outcome} />}
            </div>
          </li>
        )}
        {call.callbackResolvedAt && (
          <li className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-sage"
            />
            <p className="text-body text-ink-3">{formatDateTime(call.callbackResolvedAt, clock)}</p>
            <p className="mt-1 font-medium">
              Callback handled · {resolvedViaLabel(call.callbackResolvedVia)}
            </p>
          </li>
        )}
      </ol>
    </section>
  );
}
