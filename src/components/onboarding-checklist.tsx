"use client";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PROVIDER_LABELS, type ProviderId } from "@/components/crm-connection-section";
import { MODEL_ACCESS_COPY, readModelAccess } from "@/lib/model-access";
import { humanizeToken } from "@/lib/pro-case";
import { useSettingsStore, type SettingsSection } from "@/lib/settings-store";
interface IngestProgress {
  phase: string;
  done: boolean;
  invoicesEmitted: number;
  jobsEmitted: number;
  earliestMonth: string | null;
}
interface ChecklistState {
  modelConnected: boolean;
  apiKeyPresent: boolean;
  crmConnected: boolean;
  crmSavedProvider: string | null;
  crmLiveAdapter: string | null;
  crmMessage: string | null;
  companyNamed: boolean;
  knowledgeTaught: boolean;
  ingest: IngestProgress | null;
  gatewayReachable: boolean;
}
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(String(res.status));
  }
  return res.json();
}
async function loadChecklistState(): Promise<ChecklistState> {
  const [codex, crm, settings] = await Promise.allSettled([
    fetchJson("/api/auth/openai-codex/status"),
    fetchJson("/api/settings/crm"),
    fetchJson("/api/settings"),
  ]);
  const codexBody =
    codex.status === "fulfilled"
      ? (codex.value as {
          signedIn?: boolean;
          apiKeyPresent?: boolean;
        })
      : {};
  const crmBody =
    crm.status === "fulfilled"
      ? (crm.value as {
          provider?: string | null;
          gateway?: {
            adapter?: string;
            available?: boolean;
            mode?: string;
            message?: string;
            ingest?: IngestProgress | null;
          } | null;
        })
      : {};
  const settingsBody =
    settings.status === "fulfilled"
      ? (settings.value as {
          company?: {
            name?: string;
          };
          knowledge?: unknown[];
        })
      : {};
  return {
    modelConnected: codexBody.signedIn === true,
    apiKeyPresent: codexBody.apiKeyPresent === true,
    crmConnected: crmBody.gateway?.available === true && crmBody.gateway?.mode === "external",
    crmSavedProvider: crmBody.provider?.trim() || null,
    crmLiveAdapter: crmBody.gateway?.adapter?.trim() || null,
    crmMessage: crmBody.gateway?.message?.trim() || null,
    companyNamed: Boolean(settingsBody.company?.name?.trim()),
    knowledgeTaught: Array.isArray(settingsBody.knowledge) && settingsBody.knowledge.length > 0,
    ingest: crmBody.gateway?.ingest ?? null,
    gatewayReachable: Boolean(crmBody.gateway),
  };
}
function isIngestDone(state: ChecklistState): boolean {
  return (
    state.ingest !== null &&
    (state.ingest.done || state.ingest.phase === "backfilled" || state.ingest.phase === "delta")
  );
}
function isAllDone(state: ChecklistState): boolean {
  return (
    state.modelConnected &&
    state.crmConnected &&
    state.companyNamed &&
    state.knowledgeTaught &&
    isIngestDone(state)
  );
}
function crmDetail(state: ChecklistState): string {
  if (!state.gatewayReachable) {
    return "Scout is unreachable right now. This reads live once it is up.";
  }
  if (!state.crmSavedProvider) {
    return "Paste the shop's API keys and Scout ingests the whole book.";
  }
  if (state.crmLiveAdapter !== state.crmSavedProvider) {
    return `Keys are saved for ${PROVIDER_LABELS[state.crmSavedProvider as ProviderId] ?? humanizeToken(state.crmSavedProvider)}. Scout loads a CRM connection only when it starts, so this step stays open until it restarts. The keys do not need re-entering.`;
  }
  return state.crmMessage
    ? `Scout is running these ${PROVIDER_LABELS[state.crmSavedProvider as ProviderId] ?? humanizeToken(state.crmSavedProvider)} keys but the connection is not answering: ${state.crmMessage}`
    : `Scout is running these ${PROVIDER_LABELS[state.crmSavedProvider as ProviderId] ?? humanizeToken(state.crmSavedProvider)} keys but the connection is not answering. Re-test them.`;
}
function modelStepDetail(state: ChecklistState): string | undefined {
  const access = readModelAccess({
    signedIn: state.modelConnected,
    apiKeyPresent: state.apiKeyPresent,
  });
  if (access === "account") {
    return undefined;
  }
  const { title, detail } = MODEL_ACCESS_COPY[access];
  return `${title}. ${detail}`;
}
const REFRESH_INTERVAL_MS = 15000;
export default function OnboardingChecklist() {
  const setSection = useSettingsStore((s) => s.setSection);
  const [state, setState] = useState<ChecklistState | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const load = async () => {
      const next = await loadChecklistState();
      if (cancelled) {
        return;
      }
      setState(next);
      if (isAllDone(next)) {
        stopPolling();
      }
    };
    void load();
    timer = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, []);
  if (!state) {
    return null;
  }
  const ingestDone = isIngestDone(state);
  if (isAllDone(state)) {
    return null;
  }
  const steps: Array<{
    label: string;
    done: boolean;
    target?: SettingsSection;
    detail?: string;
  }> = [
    {
      label: "Connect the AI model",
      done: state.modelConnected,
      target: "integrations",
      detail: modelStepDetail(state),
    },
    {
      label: "Connect the CRM",
      done: state.crmConnected,
      target: "crm",
      detail: state.crmConnected ? undefined : crmDetail(state),
    },
    {
      label: "Name the company",
      done: state.companyNamed,
      target: "company",
      detail: state.companyNamed
        ? undefined
        : "Scout signs memos, texts, and calls with this name.",
    },
    {
      label: "Teach Scout the shop",
      done: state.knowledgeTaught,
      target: "knowledge",
      detail: state.knowledgeTaught
        ? undefined
        : "Warranty terms, fees, policies. Scout quotes what you write here.",
    },
  ];
  const ingestLine = !state.crmConnected
    ? state.crmSavedProvider
      ? "CRM keys are saved. Book ingest starts once Scout restarts and picks them up."
      : "Book ingest starts after the CRM connects and Scout restarts."
    : state.ingest === null
      ? "Book ingest starts within a minute of Scout's next restart."
      : ingestDone
        ? `Book ingested · ${state.ingest.invoicesEmitted.toLocaleString("en-US")} invoices, ${state.ingest.jobsEmitted.toLocaleString("en-US")} jobs.`
        : `Ingesting the book · ${state.ingest.invoicesEmitted.toLocaleString("en-US")} invoices, ${state.ingest.jobsEmitted.toLocaleString("en-US")} jobs so far${state.ingest.earliestMonth ? ` (back to ${state.ingest.earliestMonth})` : ""}.`;
  return (
    <div className="space-y-3 rounded-2xl bg-golden-tint px-4 py-4">
      <h3 className="text-body font-semibold text-ink">Getting set up</h3>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.label}>
            {step.done ? (
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={16} className="shrink-0 text-sage-deep" />
                <span className="text-body text-ink-2 line-through decoration-ink-4">
                  {step.label}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => step.target && setSection(step.target)}
                className="flex items-start gap-2.5 text-left"
              >
                <Circle size={16} className="mt-0.5 shrink-0 text-ink-4" />
                <span>
                  <span className="text-body font-medium text-ink underline-offset-2 hover:underline">
                    {step.label}
                  </span>
                  {step.detail && (
                    <span className="block text-label text-ink-3">{step.detail}</span>
                  )}
                </span>
              </button>
            )}
          </li>
        ))}
        <li className="flex items-start gap-2.5">
          {ingestDone ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sage-deep" />
          ) : state.crmConnected && state.ingest !== null ? (
            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-copper" />
          ) : (
            <Circle size={16} className="mt-0.5 shrink-0 text-ink-4" />
          )}
          <span className="text-body text-ink-2">{ingestLine}</span>
        </li>
      </ul>
    </div>
  );
}
