"use client";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Phone,
  PhoneIncoming,
  PhoneCall,
  Send,
  X,
  PhoneForwarded,
  Headphones,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CallDetailDrawer from "@/components/call-detail-drawer";
import { HistoryFilter, type GroupFilterValue } from "@/components/calls/history-filter";
import PhoneStats from "@/components/calls/phone-stats";
import {
  CustomerProvenanceTag,
  provenanceOf,
  provenanceRing,
} from "@/components/customer-provenance";
import LiveCallCard from "@/components/live-call-card";
import { OutcomeTag } from "@/components/outcome-badge";
import SegmentedControl from "@/components/segmented-control";
import { useShopClock } from "@/components/shop-clock";
import {
  fetchActiveCalls,
  fetchCallHistory,
  fetchCallStats,
  controlCall,
  resolveCallback,
  type Call,
  type CallStats,
} from "@/lib/api";
import { groupOf, isOutcomeGroup } from "@/lib/call-outcomes";
import { features } from "@/lib/features";
import {
  colorForName,
  formatDuration,
  formatPhone,
  formatShortDate,
  formatTime,
  getInitials,
  resolvedViaLabel,
} from "@/lib/format";
type Tab = "live" | "history" | "callbacks";
const PAGE_SIZE = 20;
const STATS_DAYS = 30;
const ATTENTION_PREVIEW_COUNT = 6;
const HISTORY_FETCH_LIMIT = 200;
const SLOW_POLL_MS = 8000;
const outcomesClassified = features.callOutcomes;
const CALLBACK_REASONS = [
  ["escalated", "Office follow-up requested"],
  ["unresolved", "Caller's need left open"],
  ["no-connect", "Call disconnected"],
] as const;
type CallbackReason = (typeof CALLBACK_REASONS)[number][0];
export default function CallsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-32 items-center justify-center text-body text-ink-4">Loading…</div>
      }
    >
      <CallsPageInner />
    </Suspense>
  );
}
function CallsPageInner() {
  const router = useRouter();
  const clock = useShopClock();
  const searchParams = useSearchParams();
  const rawTabParam = searchParams.get("tab");
  const rawReason = searchParams.get("reason");
  const callbackReason: CallbackReason | null =
    CALLBACK_REASONS.find(([reason]) => reason === rawReason)?.[0] ?? null;
  const tabParam: Tab | null =
    rawTabParam === "history" ||
    rawTabParam === "live" ||
    (rawTabParam === "callbacks" && outcomesClassified)
      ? rawTabParam
      : null;
  const [tab, setTab] = useState<Tab>(tabParam ?? "live");
  const [activeCalls, setActiveCalls] = useState<Call[]>([]);
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [runtimeUp, setRuntimeUp] = useState(true);
  const [history, setHistory] = useState<Call[]>([]);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [namesIncomplete, setNamesIncomplete] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [attention, setAttention] = useState<Call[]>([]);
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  const [attentionCoverage, setAttentionCoverage] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [attentionLoaded, setAttentionLoaded] = useState(false);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const loadAttention = useCallback(() => {
    fetchCallHistory({ attention: true, limit: 200 })
      .then((page) => {
        setAttention(page.calls);
        setAttentionCoverage(
          page.total > page.calls.length ? { loaded: page.calls.length, total: page.total } : null,
        );
        setAttentionError(null);
        setAttentionLoaded(true);
      })
      .catch((err) => {
        setAttentionError(err instanceof Error ? err.message : "Queue unavailable");
        setAttentionLoaded(true);
      });
  }, []);
  useEffect(() => {
    loadAttention();
  }, [loadAttention]);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const handleResolve = useCallback(
    (callId: string) => {
      setAttention((prev) => prev.filter((c) => c.id !== callId));
      resolveCallback(callId)
        .then((updated) => {
          setHistory((prev) =>
            prev.map((c) =>
              c.id === callId
                ? {
                    ...c,
                    needsAttention: undefined,
                    callbackResolvedAt: updated.callbackResolvedAt,
                    callbackResolvedVia: updated.callbackResolvedVia,
                  }
                : c,
            ),
          );
          setResolveError(null);
        })
        .catch((err) => {
          setResolveError(err instanceof Error ? err.message : "Could not mark handled");
          loadAttention();
        });
    },
    [loadAttention],
  );
  const groupParam: GroupFilterValue = (() => {
    const g = searchParams.get("group");
    return outcomesClassified && isOutcomeGroup(g) ? g : "all";
  })();
  const qParam = searchParams.get("q") ?? "";
  const rangeParam: "today" | "all" =
    searchParams.get("range") === "all" || qParam ? "all" : "today";
  const [searchInput, setSearchInput] = useState(qParam);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [callStats, setCallStats] = useState<CallStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchCallStats(STATS_DAYS)
      .then((stats) => {
        if (!cancelled) {
          setCallStats(stats);
          setStatsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatsError(err instanceof Error ? err.message : "Call stats unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const [whisperFor, setWhisperFor] = useState<Call | null>(null);
  const [whisperText, setWhisperText] = useState("");
  const [takeOverFor, setTakeOverFor] = useState<Call | null>(null);
  const [takeOverDestination, setTakeOverDestination] = useState<{
    lastFour: string;
    source: "test" | "configured" | "owner";
  } | null>(null);
  const [outboundCallFor, setOutboundCallFor] = useState<Call | null>(null);
  const [listeningTo, setListeningTo] = useState<Call | null>(null);
  const [listeningStatus, setListeningStatus] = useState<"connecting" | "live" | "ended" | "error">(
    "connecting",
  );
  const [listeningError, setListeningError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const windowOffset =
    Math.floor(((page - 1) * PAGE_SIZE) / HISTORY_FETCH_LIMIT) * HISTORY_FETCH_LIMIT;
  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [groupParam, qParam, rangeParam, tab, callbackReason]);
  const didInitialTabDecision = useRef(false);
  useEffect(() => {
    if (didInitialTabDecision.current) return;
    if (!activeLoaded) return;
    didInitialTabDecision.current = true;
    if (!tabParam && activeCalls.length === 0 && runtimeUp) {
      queueMicrotask(() => setTab("history"));
    }
  }, [tabParam, activeLoaded, activeCalls.length, runtimeUp]);
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      const late = setTimeout(() => {
        if (!cancelled) setActiveError("Live calls are taking longer than usual to load");
      }, SLOW_POLL_MS);
      try {
        const active = await fetchActiveCalls();
        if (!cancelled) {
          setActiveCalls(active.calls);
          setRuntimeUp(active.runtimeUp);
          setActiveLoaded(true);
          setActiveError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setActiveLoaded(true);
          setActiveError(err instanceof Error ? err.message : "Live calls unavailable");
        }
      } finally {
        clearTimeout(late);
        inFlight = false;
      }
    };
    void load();
    interval = setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setHistoryLoading(true);
      fetchCallHistory({
        q: qParam || undefined,
        range: rangeParam === "today" ? "today" : undefined,
        limit: HISTORY_FETCH_LIMIT,
        offset: windowOffset || undefined,
      })
        .then((page) => {
          if (!cancelled) {
            setHistory(page.calls);
            setLoadedOffset(windowOffset);
            setHistoryTotal(page.total);
            setNamesIncomplete(page.namesIncomplete);
            setHistoryError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setHistoryError(err instanceof Error ? err.message : "Call history unavailable");
          }
        })
        .finally(() => {
          if (!cancelled) setHistoryLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [qParam, rangeParam, windowOffset]);
  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(qs ? `/calls?${qs}` : `/calls`, { scroll: false });
    },
    [router, searchParams],
  );
  const switchTab = useCallback(
    (next: Tab) => {
      setTab(next);
      updateParams({ tab: next === "live" ? null : next, reason: null });
    },
    [updateParams],
  );
  const needsCallbackCalls = attention;
  const reasonCalls = callbackReason
    ? needsCallbackCalls.filter((call) => call.outcome === callbackReason)
    : needsCallbackCalls;
  const filteredHistory = useMemo(
    () =>
      groupParam === "all" ? history : history.filter((c) => groupOf(c.outcome) === groupParam),
    [history, groupParam],
  );
  const serverPaged = tab === "history" && groupParam === "all";
  const datasetForCurrentTab =
    tab === "callbacks" ? reasonCalls : tab === "history" ? filteredHistory : [];
  const totalForCurrentTab = serverPaged ? historyTotal : datasetForCurrentTab.length;
  const pageCount = Math.max(1, Math.ceil(totalForCurrentTab / PAGE_SIZE));
  const windowStale = serverPaged && loadedOffset !== windowOffset;
  const pagedRows = serverPaged
    ? windowStale
      ? []
      : history.slice((page - 1) * PAGE_SIZE - windowOffset, page * PAGE_SIZE - windowOffset)
    : datasetForCurrentTab.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }
  function stopListening() {
    setListeningTo(null);
    setListeningError(null);
  }
  function handleListen(call: Call) {
    setListeningTo(call);
    setListeningStatus("error");
    setListeningError("Playback isn't available for this call yet.");
  }
  function handleWhisperOpen(call: Call) {
    setWhisperFor(call);
    setWhisperText("");
  }
  async function handleWhisperSend() {
    if (!whisperFor) return;
    if (!whisperText.trim()) return;
    setPendingAction(`whisper:${whisperFor.id}`);
    try {
      await controlCall(whisperFor.id, "whisper", whisperText.trim());
      showToast("Instruction added to Scout's next reply");
      setWhisperFor(null);
      setWhisperText("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Whisper failed");
    } finally {
      setPendingAction(null);
    }
  }
  async function handleTakeOverOpen(call: Call) {
    setPendingAction(`take-over-preview:${call.id}`);
    try {
      const result = await controlCall(call.id, "take-over-preview");
      if (!result.destinationLastFour || !result.destinationSource) {
        throw new Error("Scout could not resolve the Take Over phone");
      }
      setTakeOverDestination({
        lastFour: result.destinationLastFour,
        source: result.destinationSource,
      });
      setTakeOverFor(call);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Take Over is unavailable");
    } finally {
      setPendingAction(null);
    }
  }
  async function handleTakeOverConfirm() {
    if (!takeOverFor) return;
    setPendingAction(`take-over:${takeOverFor.id}`);
    try {
      await controlCall(takeOverFor.id, "take-over");
      if (listeningTo?.id === takeOverFor.id) stopListening();
      showToast("Call transfer accepted");
      setTakeOverFor(null);
      setTakeOverDestination(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Call transfer failed");
    } finally {
      setPendingAction(null);
    }
  }
  function handleOutboundCall(call: Call) {
    setOutboundCallFor(call);
  }
  async function handleOutboundCallConfirm() {
    if (!outboundCallFor) return;
    setPendingAction(`outbound-call:${outboundCallFor.id}`);
    try {
      const result = await controlCall(outboundCallFor.id, "callback");
      showToast(
        result.duplicate
          ? "This outbound call was already requested"
          : `Scout outbound call started for ${outboundCallFor.callerName || formatPhone(outboundCallFor.callerPhone)}`,
      );
      setOutboundCallFor(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Outbound call failed");
    } finally {
      setPendingAction(null);
    }
  }
  return (
    <div className="space-y-6">
      <header className="animate-fadeIn pt-2">
        <p className="text-label font-bold tracking-[0.14em] uppercase text-ink-3">
          The phone line
        </p>
        <h1 className="greeting mt-2">
          Every call, <em>answered.</em>
        </h1>
        <p className="mt-2 max-w-xl text-body-lg text-ink-3">
          Live calls and full call history - answered by Scout.
        </p>
      </header>

      {(activeError || historyError || statsError) && (
        <div role="alert" className="rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm">
          <p className="font-semibold">Call Center data is not fully live.</p>
          <p className="mt-1 text-alarm/85">
            {[activeError, historyError, statsError].filter(Boolean).join(" ")}
          </p>
        </div>
      )}

      {callStats && <PhoneStats stats={callStats} />}

      {attentionLoaded && !attentionError && attention.length > 0 && (
        <section
          aria-label="Follow-up reasons"
          className="rounded-2xl bg-paper p-4 shadow-soft sm:p-5"
        >
          <h2 className="text-body-lg font-semibold text-ink">Where a follow-up can help</h2>
          <p className="mt-1 text-body text-ink-3">
            Open calls needing attention, not a count of lost bookings.
          </p>
          {attentionCoverage && (
            <p className="mt-1 text-body text-copper">
              Last queue read loaded {attentionCoverage.loaded} of {attentionCoverage.total} open
              calls. Older calls aren’t included in these counts.
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {CALLBACK_REASONS.map(([reason, label]) => {
              const count = attention.filter((call) => call.outcome === reason).length;
              return (
                <button
                  key={reason}
                  type="button"
                  disabled={!count}
                  onClick={() => {
                    setTab("callbacks");
                    updateParams({ tab: "callbacks", reason });
                  }}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-paper-2 px-4 py-3 text-left text-body-lg font-medium text-ink transition-colors hover:bg-tan-soft active:bg-tan-soft disabled:opacity-50"
                >
                  <span>{label}</span>
                  <span className="flex items-center gap-1 font-tabular font-semibold text-copper">
                    {count}
                    <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <nav
        aria-label="Call views"
        className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-paper-2 p-1 sm:w-fit [&>button]:shrink-0 [&>button]:whitespace-nowrap max-sm:[&>button]:flex-1"
      >
        <TabButton
          active={tab === "live"}
          onClick={() => switchTab("live")}
          icon={<PhoneCall size={16} strokeWidth={1.8} />}
          label="Live"
          badge={activeCalls.length > 0 ? activeCalls.length : undefined}
          badgePulse
        />
        <TabButton
          active={tab === "history"}
          onClick={() => switchTab("history")}
          icon={<PhoneIncoming size={16} strokeWidth={1.8} />}
          label="History"
        />
        {outcomesClassified && (
          <TabButton
            active={tab === "callbacks"}
            onClick={() => switchTab("callbacks")}
            icon={<PhoneForwarded size={16} strokeWidth={1.8} />}
            label="Needs callback"
            badge={needsCallbackCalls.length > 0 ? needsCallbackCalls.length : undefined}
          />
        )}
      </nav>

      {tab === "live" && (
        <LiveTab
          loaded={activeLoaded}
          calls={activeCalls}
          error={activeError}
          runtimeUp={runtimeUp}
          onListen={handleListen}
          onWhisper={handleWhisperOpen}
          onTakeOver={handleTakeOverOpen}
        />
      )}

      {(tab === "history" || tab === "callbacks") && (
        <div className="space-y-3">
          {tab === "callbacks" && callbackReason && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-paper py-1.5 pr-1.5 pl-4 text-body font-medium text-ink shadow-soft">
              <span>
                {CALLBACK_REASONS.find(([reason]) => reason === callbackReason)?.[1]} ·{" "}
                {reasonCalls.length}
              </span>
              <button
                type="button"
                onClick={() => updateParams({ reason: null })}
                className="min-h-11 rounded-full px-4 font-semibold text-sage-deep hover:bg-sage-tint active:bg-sage-tint"
              >
                Show all callbacks
              </button>
            </div>
          )}
          {resolveError && (
            <div role="alert" className="rounded-2xl bg-alarm-tint px-4 py-3 text-body text-alarm">
              {resolveError} - the item is still in the queue.
            </div>
          )}

          {tab === "history" && attentionLoaded && attention.length > 0 && (
            <section
              aria-label="Needs your attention"
              className="overflow-hidden rounded-2xl bg-golden-tint"
            >
              <h2>
                <button
                  type="button"
                  aria-expanded={attentionExpanded}
                  aria-controls="phone-attention-queue"
                  onClick={() => setAttentionExpanded((expanded) => !expanded)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left text-body-lg font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-copper sm:px-5"
                >
                  <span>Needs your attention · {attention.length}</span>
                  <ChevronDown
                    size={20}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className={`shrink-0 text-ink-2 transition-transform duration-200 ease-[var(--ease-ios)] motion-reduce:transition-none ${attentionExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              </h2>
              <div
                id="phone-attention-queue"
                hidden={!attentionExpanded}
                className="px-2 pb-2 sm:px-3 sm:pb-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 pb-3 sm:px-2">
                  <p className="max-w-xl text-body leading-relaxed text-ink-2">
                    Clears itself when Scout or the customer connects again. Called them back from
                    your own phone? Mark it handled.
                  </p>
                  {attention.length > ATTENTION_PREVIEW_COUNT && (
                    <button
                      onClick={() => switchTab("callbacks")}
                      className="min-h-11 rounded-full px-3 text-body font-semibold text-copper hover:bg-paper/60 active:bg-paper/60"
                    >
                      View all {attention.length}
                    </button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {attention.slice(0, ATTENTION_PREVIEW_COUNT).map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-paper p-3 sm:px-4"
                    >
                      <button
                        onClick={() => setSelectedCallId(c.id)}
                        className="min-w-0 basis-full text-left sm:flex-1 sm:basis-auto"
                        aria-label={`Open call detail for ${callerIdentity(c)}`}
                      >
                        <span className="block truncate text-body-lg font-semibold text-ink">
                          {callerIdentity(c)}

                          {c.callerName?.trim() && c.callerPhone ? (
                            <span className="font-medium text-copper">
                              {" "}
                              — {formatPhone(c.callerPhone)}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-body leading-snug text-ink-3">
                          {formatShortDate(c.startedAt, clock)} · {formatTime(c.startedAt, clock)}
                          {c.summary ? ` — ${c.summary}` : ""}
                        </span>
                      </button>
                      {c.outcome && <OutcomeTag outcome={c.outcome} />}
                      <button
                        onClick={() => handleResolve(c.id)}
                        aria-label={`Mark the callback for ${callerIdentity(c)} handled`}
                        className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-paper-2 px-4 text-body font-semibold text-ink-2 transition-colors hover:bg-sage-tint hover:text-sage-deep active:bg-sage-tint"
                      >
                        <Check size={16} strokeWidth={1.8} />
                        Mark handled
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {tab === "history" && !qParam && (
            <div className="max-w-[18rem]">
              <SegmentedControl
                label="Time range"
                value={rangeParam === "all" ? "all" : "today"}
                onChange={(key) => updateParams({ range: key === "all" ? "all" : null })}
                options={[
                  { key: "today", name: "Today" },
                  { key: "all", name: "All history" },
                ]}
              />
            </div>
          )}

          {tab === "history" && (
            <HistoryFilter
              group={groupParam}
              showResultGroups={outcomesClassified}
              search={searchInput}
              onGroupChange={(g) => updateParams({ group: g === "all" ? null : g })}
              onSearchInputChange={setSearchInput}
              onSearchSubmit={() => updateParams({ q: searchInput.trim() || null })}
              onClear={() => {
                setSearchInput("");
                updateParams({ group: null, q: null });
              }}
            />
          )}

          <CallsTable
            rows={pagedRows}
            loading={historyLoading || windowStale}
            error={historyError}
            emptyText={
              tab === "callbacks"
                ? attentionError
                  ? "The callback queue could not be loaded."
                  : history.some((c) => c.outcome)
                    ? "Nobody is waiting on a callback - you're caught up."
                    : "Nothing classified yet - results appear as Scout finishes new calls."
                : "No calls match your filters."
            }
            tab={tab}
            onRowClick={(c) => setSelectedCallId(c.id)}
            onOutboundCall={handleOutboundCall}
            onResolve={(c) => handleResolve(c.id)}
          />

          {tab === "history" && !serverPaged && historyTotal > history.length && (
            <p className="px-1 text-body text-ink-3">
              This view checks the {history.length} calls loaded here, out of {historyTotal} in the
              record. Calls older than that are not included yet.
            </p>
          )}

          {tab === "history" && qParam && namesIncomplete && pagedRows.length === 0 && (
            <p className="px-1 text-body text-ink-3">
              Some callers couldn&rsquo;t be checked by name just now, so a name search may be
              missing matches. Searching the phone number always covers the full record.
            </p>
          )}

          {totalForCurrentTab > PAGE_SIZE && (
            <Pagination
              page={page}
              pageCount={pageCount}
              onChange={setPage}
              total={totalForCurrentTab}
            />
          )}
        </div>
      )}

      <CallDetailDrawer
        callId={selectedCallId}
        onClose={() => setSelectedCallId(null)}
        onResolveCallback={handleResolve}
      />

      {features.liveCallControls && whisperFor && (
        <Modal
          title={`Whisper to Scout`}
          subtitle={`Privately guide Scout's next reply to ${whisperFor.callerName || formatPhone(whisperFor.callerPhone)}`}
          onClose={() => setWhisperFor(null)}
        >
          <textarea
            value={whisperText}
            onChange={(e) => setWhisperText(e.target.value)}
            rows={3}
            placeholder="e.g. mention the spring promo, or push for booking today"
            className="w-full resize-none rounded-2xl bg-paper-2 px-4 py-3 text-body-lg text-ink placeholder:text-ink-4"
          />
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={() => setWhisperFor(null)}
              className="min-h-11 rounded-full px-4 text-body-lg font-semibold text-ink-2 hover:bg-paper-2 sm:text-body"
            >
              Cancel
            </button>
            <button
              onClick={handleWhisperSend}
              disabled={!whisperText.trim() || pendingAction === `whisper:${whisperFor.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-terracotta px-5 text-body-lg font-semibold text-on-accent transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:bg-tan sm:min-h-11 sm:text-body"
            >
              <Send size={14} />
              {pendingAction === `whisper:${whisperFor.id}` ? "Sending…" : "Send to Scout"}
            </button>
          </div>
        </Modal>
      )}

      {features.liveCallControls && takeOverFor && (
        <Modal
          title="Take over this call?"
          subtitle={
            takeOverDestination
              ? `The call will transfer to the ${
                  takeOverDestination.source === "test"
                    ? "authorized test phone"
                    : takeOverDestination.source === "owner"
                      ? "owner phone"
                      : "configured Take Over phone"
                } ending in ${takeOverDestination.lastFour}.`
              : "Scout is checking the Take Over destination."
          }
          onClose={() => {
            setTakeOverFor(null);
            setTakeOverDestination(null);
          }}
        >
          <div className="rounded-2xl bg-paper-2 px-4 py-3 text-body-lg text-ink">
            <div className="font-semibold">{takeOverFor.callerName || "Unknown caller"}</div>
            <div className="text-body text-ink-3">{formatPhone(takeOverFor.callerPhone)}</div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={() => {
                setTakeOverFor(null);
                setTakeOverDestination(null);
              }}
              className="min-h-11 rounded-full px-4 text-body-lg font-semibold text-ink-2 hover:bg-paper-2 sm:text-body"
            >
              Cancel
            </button>
            <button
              onClick={handleTakeOverConfirm}
              disabled={pendingAction === `take-over:${takeOverFor.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-golden px-5 text-body-lg font-semibold text-on-accent transition-colors hover:bg-copper sm:min-h-11 sm:text-body"
            >
              <PhoneForwarded size={14} />
              {pendingAction === `take-over:${takeOverFor.id}` ? "Transferring…" : "Transfer"}
            </button>
          </div>
        </Modal>
      )}

      {features.scoutCallback && outboundCallFor && (
        <Modal
          title="Have Scout call back?"
          subtitle="This immediately places a new AI-assisted outbound call."
          onClose={() => setOutboundCallFor(null)}
        >
          <div className="rounded-2xl bg-paper-2 px-4 py-3 text-body-lg text-ink">
            <div className="font-semibold">{outboundCallFor.callerName || "Unknown caller"}</div>
            <div className="text-body text-ink-3">{formatPhone(outboundCallFor.callerPhone)}</div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={() => setOutboundCallFor(null)}
              className="min-h-11 rounded-full px-4 text-body-lg font-semibold text-ink-2 hover:bg-paper-2 sm:text-body"
            >
              Cancel
            </button>
            <button
              onClick={handleOutboundCallConfirm}
              disabled={pendingAction === `outbound-call:${outboundCallFor.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-terracotta px-5 text-body-lg font-semibold text-on-accent transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:bg-tan sm:min-h-11 sm:text-body"
            >
              <PhoneCall size={14} />
              {pendingAction === `outbound-call:${outboundCallFor.id}`
                ? "Starting…"
                : "Start outbound call"}
            </button>
          </div>
        </Modal>
      )}

      {features.liveCallControls && listeningTo && (
        <div className="fixed right-4 bottom-[calc(1rem+var(--safe-b))] z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-paper p-4 shadow-lift">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-body font-semibold text-ink">
              <Headphones size={16} className="text-terracotta-deep" />
              Listening live
            </div>
            <button
              onClick={stopListening}
              className="rounded-md p-1 text-ink-4 hover:bg-paper-2 hover:text-ink-2"
              aria-label="Stop listening"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mb-3 text-label text-ink-3">
            {listeningTo.callerName || formatPhone(listeningTo.callerPhone)}
          </div>
          <div
            className={`rounded-lg px-3 py-2 text-center text-label ${
              listeningStatus === "error"
                ? "bg-alarm-tint text-alarm"
                : listeningStatus === "live"
                  ? "bg-sage-tint text-sage-deep"
                  : "bg-paper-2 text-ink-3"
            }`}
          >
            {listeningStatus === "connecting" && "Connecting to live audio…"}
            {listeningStatus === "live" && "Live audio connected"}
            {listeningStatus === "ended" && "The live audio stream ended"}
            {listeningStatus === "error" && (listeningError || "Live audio is unavailable")}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-body text-paper shadow-card"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgePulse,
  badgeAtLeast,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  badgePulse?: boolean;
  badgeAtLeast?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-body font-semibold transition-colors duration-200 ease-[var(--ease-ios)] ${active ? "bg-terracotta-tint text-terracotta-deep" : "text-ink-3 hover:text-ink-2"}`}
    >
      <span aria-hidden="true" className="hidden sm:inline-flex">
        {icon}
      </span>
      {label}
      {badge !== undefined && (
        <span
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-tabular text-caption font-semibold ${active ? "bg-paper text-terracotta-deep" : "bg-paper text-ink-2"} ${badgePulse ? "motion-safe:animate-pulse" : ""}`}
        >
          {badge}
          {badgeAtLeast ? "+" : ""}
        </span>
      )}
    </button>
  );
}
function LiveTab({
  loaded,
  calls,
  error,
  runtimeUp,
  onListen,
  onWhisper,
  onTakeOver,
}: {
  loaded: boolean;
  calls: Call[];
  error: string | null;
  runtimeUp: boolean;
  onListen: (c: Call) => void;
  onWhisper: (c: Call) => void;
  onTakeOver: (c: Call) => void;
}) {
  return (
    <div>
      {!loaded && (
        <div className="rounded-2xl bg-paper p-10 text-center text-body text-ink-3">
          Loading active calls…
        </div>
      )}

      {loaded && error && calls.length === 0 && (
        <div className="rounded-2xl bg-alarm-tint p-10 text-center text-body text-alarm">
          Live call data is unavailable. {error}
        </div>
      )}

      {loaded && !error && !runtimeUp && (
        <div role="alert" className="rounded-2xl bg-alarm-tint px-6 py-10 text-center">
          <p className="text-body-lg font-semibold text-alarm">
            The phone system isn&apos;t running - calls are not being answered.
          </p>
          <p className="mt-2 text-body text-alarm/85">
            Scout can&apos;t pick up until the phone system reconnects. If this doesn&apos;t clear
            in a minute, restart it or contact support.
          </p>
        </div>
      )}

      {loaded && !error && runtimeUp && calls.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl bg-paper px-6 py-12 text-center shadow-soft">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-tint text-sage-deep">
            <Phone size={21} strokeWidth={1.8} />
          </span>
          <p className="mt-4 text-title font-semibold text-ink">All quiet on the line</p>
          <p className="mt-1.5 max-w-md text-body leading-relaxed text-ink-3">
            No calls coming through right now. Scout&apos;s ready to pick up in two rings - qualify
            the job, check the calendar, book the slot. You&apos;ll see live calls land here the
            moment they connect.
          </p>
        </div>
      )}

      {loaded && calls.length > 0 && (
        <div className="space-y-4">
          {calls.map((c) => (
            <LiveCallCard
              key={c.id}
              call={c}
              onListen={onListen}
              onWhisper={onWhisper}
              onTakeOver={onTakeOver}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function whatHappenedPreview(c: Call): string | undefined {
  if (c.summary) return c.summary;
  const firstCallerTurn = c.turns?.find((t) => t.speaker === "caller")?.text;
  if (firstCallerTurn) return `“${firstCallerTurn}”`;
  return undefined;
}
function openOnKey(open: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  };
}
function callerIdentity(c: Call): string {
  return c.callerName?.trim() || formatPhone(c.callerPhone) || "Unknown caller";
}
function openLabel(c: Call): string {
  const name = c.callerName?.trim();
  const phone = formatPhone(c.callerPhone);
  if (name) {
    return `Open call detail for ${name} at ${formatPhone(phone)}`;
  }
  return `Open call detail for the call from ${phone || "an unknown number"}`;
}
function CallsTable({
  rows,
  loading,
  error,
  emptyText,
  tab,
  onRowClick,
  onOutboundCall,
  onResolve,
}: {
  rows: Call[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  tab: Tab;
  onRowClick: (c: Call) => void;
  onOutboundCall: (c: Call) => void;
  onResolve?: (c: Call) => void;
}) {
  const clock = useShopClock();
  const showCallbackAction = features.scoutCallback && (tab === "callbacks" || tab === "history");
  const showActionColumn = showCallbackAction || onResolve !== undefined;
  if (loading) {
    return (
      <div className="rounded-2xl bg-paper p-10 text-center text-body text-ink-3">
        Loading calls…
      </div>
    );
  }
  if (error && rows.length === 0) {
    return (
      <div className="rounded-2xl bg-alarm-tint p-10 text-center text-body text-alarm">
        Call history is unavailable. {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-paper px-6 py-12 text-center">
        <p className="text-body-lg font-medium text-ink-2">{emptyText}</p>
      </div>
    );
  }
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl bg-paper shadow-soft sm:block">
        <table className="w-full table-fixed text-left text-body">
          <thead>
            <tr className="text-label text-ink-3">
              <th className="w-[200px] px-5 pt-4 pb-2 font-medium lg:w-[280px]">Caller</th>
              <th className="px-5 pt-4 pb-2 font-medium">What happened</th>
              <th className="w-[104px] px-5 pt-4 pb-2 text-right font-medium lg:w-[132px]">When</th>
              {showActionColumn && (
                <th className="w-[150px] pt-4 pr-5 pb-2 pl-2 text-right font-medium lg:w-[170px]">
                  Action
                </th>
              )}
            </tr>
          </thead>

          <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-ink/6">
            {rows.map((c) => {
              const provenance = provenanceOf(c.customerMatchStatus);
              return (
                <tr
                  key={c.id}
                  onClick={() => onRowClick(c)}
                  onKeyDown={openOnKey(() => onRowClick(c))}
                  tabIndex={0}
                  aria-label={openLabel(c)}
                  className="cursor-pointer align-top transition-colors hover:bg-paper-2/60"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-body font-semibold ${colorForName(c.callerName ?? c.callerPhone)} ${provenanceRing(provenance)}`}
                      >
                        {getInitials(c.callerName)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-body-lg font-semibold text-ink">
                          {callerIdentity(c)}
                        </div>

                        {c.callerName?.trim() && (
                          <div className="truncate text-body text-ink-3">
                            {formatPhone(c.callerPhone)}
                          </div>
                        )}
                        {c.customerMatchStatus && (
                          <CustomerProvenanceTag provenance={provenance} className="mt-0.5" />
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {c.status === "failed" && !c.outcome && (
                      <div className="mb-1">
                        <FailedTag />
                      </div>
                    )}
                    {c.outcome && (
                      <div className="mb-1">
                        <OutcomeTag outcome={c.outcome} />
                      </div>
                    )}
                    {whatHappenedPreview(c) && (
                      <p
                        className={`line-clamp-2 max-w-xl text-body leading-snug ${c.summary ? "text-ink-2" : "text-ink-3"}`}
                      >
                        {whatHappenedPreview(c)}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <div className="text-body font-medium text-ink-2">
                      {formatShortDate(c.startedAt, clock)}
                    </div>
                    <div className="mt-0.5 text-label text-ink-3">
                      {formatTime(c.startedAt, clock)}
                      {c.durationSec ? (
                        <>
                          {" · "}
                          <span className="font-tabular">{formatDuration(c.durationSec)}</span>
                        </>
                      ) : null}
                    </div>
                  </td>
                  {showActionColumn && (
                    <td className="py-4 pr-5 pl-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {showCallbackAction && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOutboundCall(c);
                            }}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-terracotta-tint px-3 text-label font-semibold whitespace-nowrap text-terracotta-deep hover:bg-terracotta-soft"
                          >
                            <PhoneCall size={14} strokeWidth={1.8} />
                            Have Scout call back
                          </button>
                        )}
                        {onResolve && c.needsAttention && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onResolve(c);
                            }}
                            aria-label={`Mark the callback for ${callerIdentity(c)} handled`}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-sage-tint px-3 text-label font-semibold whitespace-nowrap text-sage-deep hover:bg-sage-soft"
                          >
                            <Check size={14} strokeWidth={1.8} />
                            Mark handled
                          </button>
                        )}
                        {c.callbackResolvedAt && (
                          <span
                            className="inline-flex items-center gap-1 text-label font-medium text-sage-deep"
                            title={`Handled ${formatShortDate(c.callbackResolvedAt, clock)} (${resolvedViaLabel(c.callbackResolvedVia)})`}
                          >
                            <Check size={14} strokeWidth={1.8} />
                            Handled
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="overflow-hidden rounded-2xl bg-paper shadow-soft sm:hidden">
        {rows.map((c) => {
          const provenance = provenanceOf(c.customerMatchStatus);
          return (
            <li key={c.id} className="ios-sep ios-sep-avatar">
              <div
                onClick={() => onRowClick(c)}
                onKeyDown={openOnKey(() => onRowClick(c))}
                tabIndex={0}
                aria-label={openLabel(c)}
                className="flex cursor-pointer gap-3 px-4 py-3.5 transition-colors active:bg-paper-2"
              >
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-body font-semibold ${colorForName(c.callerName ?? c.callerPhone)} ${provenanceRing(provenance)}`}
                >
                  {getInitials(c.callerName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body-lg font-semibold text-ink">
                      {callerIdentity(c)}
                    </span>
                    <span className="shrink-0 text-label text-ink-3">
                      {formatShortDate(c.startedAt, clock)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-body text-ink-3">
                    <span className="truncate">
                      {c.callerName?.trim() ? formatPhone(c.callerPhone) : null}
                    </span>
                    <span className="shrink-0 font-tabular text-label">
                      {formatTime(c.startedAt, clock)}
                      {c.durationSec ? ` · ${formatDuration(c.durationSec)}` : ""}
                    </span>
                  </div>
                  {c.customerMatchStatus && (
                    <CustomerProvenanceTag provenance={provenance} className="mt-1" />
                  )}

                  {c.status === "failed" && !c.outcome && (
                    <div className="mt-1.5">
                      <FailedTag />
                    </div>
                  )}
                  {c.outcome && (
                    <div className="mt-1.5">
                      <OutcomeTag outcome={c.outcome} />
                    </div>
                  )}
                  {whatHappenedPreview(c) && (
                    <p
                      className={`mt-1 line-clamp-2 text-body leading-snug ${c.summary ? "text-ink-2" : "text-ink-3"}`}
                    >
                      {whatHappenedPreview(c)}
                    </p>
                  )}
                  {showCallbackAction && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOutboundCall(c);
                      }}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-terracotta-tint px-4 text-body font-semibold text-terracotta-deep"
                    >
                      <PhoneCall size={16} strokeWidth={1.8} />
                      Have Scout call back
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
function FailedTag() {
  return (
    <span className="inline-flex items-center rounded-full bg-alarm-tint px-2.5 py-0.5 text-label font-semibold text-alarm">
      Didn&apos;t connect
    </span>
  );
}
function Pagination({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-body text-ink-3">
      <div>
        Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}
      </div>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="min-h-11 rounded-full bg-paper-2 px-4 font-semibold text-ink-2 transition-colors hover:bg-tan-soft active:bg-tan-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-1">
          Page <span className="font-semibold text-ink-2">{page}</span> of {pageCount}
        </span>
        <button
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          className="min-h-11 rounded-full bg-paper-2 px-4 font-semibold text-ink-2 transition-colors hover:bg-tan-soft active:bg-tan-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="animate-backdropFade absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-modalEnter relative w-full max-w-md rounded-t-[28px] bg-paper px-5 pt-5 pb-[calc(1.25rem+var(--safe-b))] shadow-lift sm:rounded-[28px] sm:pb-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-title font-semibold text-ink">{title}</h3>
            {subtitle && <p className="mt-1 text-body text-ink-3">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-2 hover:text-ink"
            aria-label="Close"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
