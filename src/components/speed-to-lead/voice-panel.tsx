"use client";
import { ArrowUpRight, Phone, PhoneCall, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useShopClock } from "@/components/shop-clock";
import { fetchActiveCalls, fetchCall, type Call } from "@/lib/api";
import { shopTime } from "@/lib/shop-time";
import type { Lead } from "@/lib/speed-to-lead/model";
import { SOURCE_NAMES } from "@/lib/speed-to-lead/model";
import {
  fetchStlVoiceCapability,
  initiateStlCallback,
  type StlVoiceCapability,
  type StlVoiceInitiateResult,
} from "@/lib/speed-to-lead/voice";
import { button, input, primary } from "./pieces";
export function VoicePanel({
  leads = [],
  selectedId = null,
  onSelectLead,
}: {
  leads?: Lead[];
  selectedId?: string | null;
  onSelectLead?: (id: string) => void;
}) {
  const clock = useShopClock();
  const ranked = [...leads].toSorted((a, b) => b.receivedAt - a.receivedAt);
  const [localId, setLocalId] = useState<string | null>(null);
  useEffect(() => {
    setLocalId(null);
  }, [selectedId]);
  const lead = ranked.find((item) => item.id === (localId ?? selectedId)) ?? ranked[0] ?? null;
  const [calls, setCalls] = useState<Call[]>([]);
  const [runtimeUp, setRuntimeUp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [capability, setCapability] = useState<StlVoiceCapability | null>(null);
  const [placing, setPlacing] = useState(false);
  const [initiate, setInitiate] = useState<StlVoiceInitiateResult | null>(null);
  const [tracked, setTracked] = useState<Call | null>(null);
  useEffect(() => {
    let cancelled = false;
    let seq = 0;
    async function load() {
      const my = ++seq;
      try {
        const [activeResult, capResult] = await Promise.allSettled([
          fetchActiveCalls(),
          fetchStlVoiceCapability(),
        ]);
        if (cancelled || my !== seq) return;
        if (activeResult.status === "fulfilled") {
          setCalls(activeResult.value.calls ?? []);
          setRuntimeUp(activeResult.value.runtimeUp !== false);
          setError(null);
        } else {
          setCalls([]);
          setRuntimeUp(false);
          setError(
            activeResult.reason instanceof Error
              ? activeResult.reason.message
              : "Voice gateway unreachable",
          );
        }
        if (capResult.status === "fulfilled") {
          setCapability(capResult.value);
        } else {
          setCapability({
            mode: "disabled",
            capabilities: { liveOutbound: false, parallelSms: true, voicemailFallback: false },
          });
        }
        setCheckedAt(new Date());
      } finally {
        if (!cancelled && my === seq) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!initiate?.initiated || !initiate.callId) return;
    const callId = initiate.callId;
    let cancelled = false;
    async function poll() {
      try {
        const call = await fetchCall(callId);
        if (!cancelled) setTracked(call);
      } catch {}
    }
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [initiate]);
  async function placeCallback() {
    if (!lead) return;
    setPlacing(true);
    try {
      const result = await initiateStlCallback({
        leadId: lead.id,
        source: lead.source,
        to: lead.phone,
      });
      setInitiate(result);
      setTracked(null);
    } catch (err) {
      setInitiate({
        ok: false,
        initiated: false,
        mode: capability?.mode ?? "disabled",
        error: err instanceof Error ? err.message : "Couldn't start the callback.",
      });
    } finally {
      setPlacing(false);
    }
  }
  function chooseLead(id: string) {
    setLocalId(id);
    onSelectLead?.(id);
    setInitiate(null);
    setTracked(null);
  }
  const mode = capability?.mode;
  const canPlace = Boolean(lead) && mode != null && mode !== "disabled" && !placing;
  const triggerHelp = lead
    ? "Start a callback for the selected lead here."
    : "Choose a paid lead to start a callback.";
  return (
    <div className="space-y-5">
      <div role="status" className="rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink-2">
        <p className="font-semibold">Voice callbacks start on this tab</p>
        <p className="mt-1 opacity-90">
          Choose a lead and start a callback with Scout. Demo mode will not place a live call. Call
          status appears only when reported.
        </p>
      </div>

      <section className="rounded-[24px] bg-paper p-5 shadow-soft">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 flex items-center gap-2 text-caption uppercase tracking-[0.14em] text-terracotta">
              <Phone size={13} /> STL Voice
            </p>
            <h2 className="font-display text-2xl text-ink">Answer. Text. Book.</h2>
            <p className="mt-2 max-w-xl text-body text-ink-3">
              Scout calls while Speed to Lead handles SMS in parallel. Voicemail drop is only a
              fallback for unanswered calls.
            </p>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={primary}
                onClick={() => void placeCallback()}
                disabled={!canPlace}
                aria-describedby="stl-voice-trigger-help"
                data-testid="stl-voice-initiate"
              >
                {placing ? "Starting callback…" : "Start Vapi outbound"}
              </button>
              <Link href="/calls" className={button} data-testid="stl-voice-open-calls">
                Open Call Center
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <p id="stl-voice-trigger-help" className="mt-2 text-caption text-ink-3">
              {triggerHelp}
            </p>
          </div>
        </header>

        <div className="mt-5 rounded-2xl bg-ink/4 px-4 py-3" data-testid="stl-voice-capability">
          <p className="text-label font-semibold text-ink">
            {mode === "live"
              ? "Live ready"
              : mode === "mock"
                ? "Demo mock — will not place a live call"
                : mode === "disabled"
                  ? "Not ready"
                  : "Checking call availability…"}
          </p>
          {mode === "disabled" && (
            <p className="mt-1 text-caption text-ink-3">
              Calls are unavailable right now. Please try again shortly.
            </p>
          )}
          {capability && (
            <p className="mt-2 text-caption text-ink-3">
              Parallel SMS: {capability.capabilities.parallelSms ? "available" : "not ready"} ·
              Voicemail drop:{" "}
              {capability.capabilities.voicemailFallback ? "unanswered calls only" : "not ready"}
            </p>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-ink/4 px-4 py-4">
          {ranked.length > 0 ? (
            <>
              <label className="block">
                <span className="text-caption uppercase tracking-[0.14em] text-terracotta">
                  Paid-lead callback
                </span>
                <select
                  aria-label="Paid lead to call"
                  className={`${input} mt-2 w-full`}
                  data-testid="stl-voice-lead"
                  value={lead?.id ?? ""}
                  onChange={(event) => chooseLead(event.target.value)}
                >
                  {ranked.slice(0, 20).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {SOURCE_NAMES[item.source]} · {item.phone}
                    </option>
                  ))}
                </select>
              </label>
              {lead && (
                <p className="mt-2 text-caption text-ink-3">
                  {lead.service} · {lead.area}
                </p>
              )}
            </>
          ) : (
            <p className="text-label text-ink-3">
              Run a lead demo on this tab, then choose a lead to try a callback.
            </p>
          )}
          {initiate && (
            <p className="mt-3 text-caption text-ink-3" data-testid="stl-voice-initiate-result">
              {initiate.initiated && initiate.callId
                ? "Call started. Checking its status…"
                : (initiate.error ??
                  (initiate.mode === "mock"
                    ? "Demo only — no live call was placed."
                    : initiate.mode === "disabled"
                      ? "Calls are not ready. No call was placed."
                      : "Callback was not placed."))}
            </p>
          )}
          {tracked && (
            <p className="mt-1 text-label text-ink-3">
              Status {tracked.status}
              {tracked.endedReason ? ` · ${tracked.endedReason}` : ""}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] bg-paper p-5 shadow-soft" aria-label="Active calls peek">
        <header className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PhoneCall size={16} className="text-terracotta" />
            <h3 className="text-body font-semibold text-ink">Active calls</h3>
          </div>
          {checkedAt && (
            <p className="text-label text-ink-3">
              Checked {shopTime(checkedAt.getTime(), clock)} · updates every 5 seconds
            </p>
          )}
        </header>
        <p className="mb-4 text-label text-ink-3">
          Calls from Call Center appear here. Partner voice leads are not connected yet.
        </p>
        {loading && <p className="text-label text-ink-3">Checking active calls…</p>}
        {!loading && error && (
          <div className="rounded-2xl bg-ink/4 px-4 py-3 text-body text-ink-3">
            <p className="font-medium">No live voice feed in this session</p>
            <p className="mt-1 text-caption opacity-80">{error}</p>
          </div>
        )}
        {!loading && !error && !runtimeUp && (
          <div role="alert" className="rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink-2">
            <p className="font-medium">Call service is unavailable</p>
            <p className="mt-1 text-caption opacity-90">
              We cannot check active calls right now. Please try again shortly.
            </p>
          </div>
        )}
        {!loading && !error && runtimeUp && calls.length === 0 && (
          <div className="rounded-2xl bg-ink/4 px-4 py-6 text-center text-body text-ink-3">
            <Radio size={18} className="mx-auto mb-2 text-ink-4" />
            No active calls right now.
          </div>
        )}
        {!loading && !error && runtimeUp && calls.length > 0 && (
          <ul className="space-y-2">
            {calls.slice(0, 5).map((call) => (
              <li
                key={call.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink/4 px-4 py-3"
              >
                <div>
                  <p className="text-label font-semibold text-ink">
                    {call.callerName ?? call.callerPhone ?? "Unknown caller"}
                  </p>
                  <p className="text-label text-ink-3">
                    Call Center · not an STL partner voice lead
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
