"use client";
import { ChevronRight, Pause, Play, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/lib/settings-store";
import { SOURCE_NAMES, SOURCES, summarize, type Source } from "@/lib/speed-to-lead/model";
import { useLeadDemo } from "./demo-provider";
import { button, primary, SourceMark } from "./pieces";
const DETAILS: Record<
  Source,
  {
    description: string;
    account: string;
    transport: string;
    setup: string[];
  }
> = {
  google_lsa: {
    description: "Connect your Local Services account in Settings and verify Google lead access.",
    account: "Google account connection managed in Settings",
    transport: "Google LSA",
    setup: [
      "Save the required Google connection details",
      "Authorize the Google account that owns your LSA campaign",
      "Verify lead access and the response channel before activation",
    ],
  },
  meta: {
    description: "Turn that Facebook or Instagram inquiry into a real conversation.",
    account: "Demo Services · Facebook Page",
    transport: "Scout SMS",
    setup: [
      "Connect your business Page",
      "Choose the lead forms Scout handles",
      "Preview the first message and test delivery",
    ],
  },
  thumbtack: {
    description: "Get the conversation started while the project is still top of mind.",
    account: "Demo Services · Thumbtack Pro",
    transport: "Lead conversation",
    setup: [
      "Connect your Thumbtack business",
      "Verify the supported reply channel",
      "Send and answer a controlled test inquiry",
    ],
  },
  angi: {
    description: "A new homeowner request. A helpful answer. No waiting around.",
    account: "Demo Services · Angi Pro",
    transport: "Scout SMS",
    setup: [
      "Link your Angi business",
      "Verify incoming lead delivery",
      "Test Scout's first response",
    ],
  },
  yelp: {
    description: "Meet a request for a quote with a useful next step.",
    account: "Demo Services · Yelp Business",
    transport: "Lead conversation",
    setup: [
      "Confirm integration access for your account",
      "Verify lead and conversation delivery",
      "Test the supported response channel",
    ],
  },
  website: {
    description:
      "Capture form leads from your site. Live intake needs smsPermission and your website leads key.",
    account: "Not connected · POST /api/leads/website",
    transport: "Website form → Scout SMS (requires smsPermission: true)",
    setup: [
      "Point your form webhook at POST /api/leads/website",
      "Send your website leads key in the request",
      "Include smsPermission as a real boolean (required)",
    ],
  },
};
function partnerBadge(source: Source, paused: boolean): string {
  if (source === "website") return "Empty slot";
  if (source === "google_lsa") {
    return "Configure in Settings";
  }
  return paused ? "Demo paused" : "Demo preview";
}
function partnerBadgeClass(source: Source, paused: boolean): string {
  if (source === "website" || source === "google_lsa") {
    return "bg-ink/6 text-ink-3";
  }
  if (paused) return "bg-golden-tint text-ink-2";
  return "bg-sage-tint text-sage-deep";
}
export function PartnerSetup({ openLead }: { openLead: (id: string) => void }) {
  const { state, dispatch, run, isDemo } = useLeadDemo();
  const [selected, setSelected] = useState<Source | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) {
      dialog.current?.showModal();
    }
    return () => {
      trigger.current?.focus();
    };
  }, [selected]);
  if (!isDemo)
    return (
      <section className="space-y-5">
        <h2 className="font-display text-2xl text-ink">Connect your lead sources</h2>
        <p className="text-body text-ink-3">
          Connect an account, choose its lead source, and test the connection in Settings. Scout
          uses your saved shop information and CRM booking settings.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              { name: "Google Local Services Ads", panel: "google-lsa" },
              { name: "Meta lead forms", panel: "meta" },
            ] as const
          ).map(({ name, panel }) => (
            <div key={panel} className="rounded-[24px] bg-paper p-5 shadow-soft">
              <h3 className="text-body-lg font-semibold text-ink">{name}</h3>
              <button
                className={`${button} mt-4`}
                onClick={() => useSettingsStore.getState().openSettings(panel)}
              >
                Manage connection
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl text-ink">Your lead sources. Working together.</h2>
        <p className="mt-2 text-body text-ink-3">
          Preview how each partner feeds Scout. Most partner cards are simulation previews — not
          live OAuth connections. Website stays empty until ingress is configured. Google LSA
          connects through Settings.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SOURCES.map((source) => {
          const paused = state.paused.includes(source);
          const stats = summarize(state.leads.filter((lead) => lead.source === source));
          return (
            <section key={source} className="rounded-[24px] bg-paper p-5 shadow-soft">
              <header className="flex items-center gap-3">
                <SourceMark source={source} />
                <h3 className="flex-1 text-body-lg font-semibold text-ink">
                  {SOURCE_NAMES[source]}
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label font-medium ${partnerBadgeClass(source, paused)}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {partnerBadge(source, paused)}
                </span>
              </header>
              <p className="mt-4 min-h-10 text-body leading-relaxed text-ink-3">
                {DETAILS[source].description}
              </p>
              <div className="mt-4 flex gap-6 rounded-2xl bg-ink/4 px-4 py-3">
                <div>
                  <p className="text-title font-semibold text-ink tabular-nums">{stats.total}</p>
                  <p className="text-label text-ink-3">Inquiries</p>
                </div>
                <div>
                  <p className="text-title font-semibold text-ink tabular-nums">{stats.booked}</p>
                  <p className="text-label text-ink-3">Booked</p>
                </div>
                <div className="ml-auto self-center text-right text-label text-ink-3">
                  {DETAILS[source].transport}
                </div>
              </div>
              <footer className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className={button}
                  data-testid={`stl-partner-open-${source}`}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setSelected(source);
                  }}
                >
                  View connection <ChevronRight size={12} />
                </button>
                {source !== "website" && source !== "google_lsa" && (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-body font-medium text-ink-3 hover:bg-ink/6 hover:text-ink"
                    onClick={() => dispatch({ type: "pause", source })}
                  >
                    {paused ? <Play size={12} /> : <Pause size={12} />}
                    {paused ? "Resume" : "Pause"}
                  </button>
                )}
              </footer>
            </section>
          );
        })}
      </div>
      {selected && (
        <dialog
          ref={dialog}
          aria-labelledby="partner-title"
          className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-[28px] bg-paper p-6 text-ink shadow-lift backdrop:bg-black/40 backdrop:backdrop-blur-sm"
          onCancel={() => setSelected(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <div>
            <header className="flex items-center gap-3">
              <SourceMark source={selected} />
              <h2 id="partner-title" className="flex-1 text-title font-semibold">
                {SOURCE_NAMES[selected]}
              </h2>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-ink/6 hover:text-ink"
                aria-label="Close connection"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </header>
            <p className="mt-4 text-body text-ink-3">{DETAILS[selected].account}</p>
            <div className="mt-4 space-y-3 rounded-2xl bg-ink/4 p-4">
              {DETAILS[selected].setup.map((step, index) => (
                <div key={step} className="flex items-center gap-3 text-body text-ink-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracotta-tint text-label font-semibold text-terracotta-deep">
                    {index + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>

            {selected === "google_lsa" && (
              <button
                type="button"
                className={`${button} mt-4`}
                onClick={() => {
                  setSelected(null);
                  useSettingsStore.getState().openSettings("google-lsa");
                }}
              >
                Open Google LSA Settings
              </button>
            )}

            <p className="mt-4 text-label leading-relaxed text-ink-3">
              {selected === "website"
                ? "Website is not a demo-connected partner. Live intake uses POST /api/leads/website with your website leads key and smsPermission boolean — no simulated connected state here."
                : selected === "google_lsa"
                  ? "Connect and test the real account in Settings. The sample below is a simulation and does not prove live lead delivery or booking."
                  : "This preview does not connect a live account. Run a sample to see a simulated lead arrive, Scout respond, and a demo booking appear."}
            </p>
            {selected === "website" ? (
              <p className="mt-5 rounded-2xl bg-ink/4 px-4 py-3 text-label text-ink-3">
                Wire your form to the website ingress when you are ready — this slot stays empty in
                Demo until then.
              </p>
            ) : (
              <button
                type="button"
                className={`${primary} mt-5 w-full`}
                data-testid={`stl-partner-sample-${selected}`}
                disabled={Boolean(state.runningId) || state.paused.includes(selected)}
                onClick={() => {
                  const id = run(selected);
                  if (id) {
                    setSelected(null);
                    openLead(id);
                  }
                }}
              >
                <Radio size={14} />
                Run sample lead
              </button>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
