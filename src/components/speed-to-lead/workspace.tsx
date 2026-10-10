"use client";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  History,
  Inbox,
  LayoutDashboard,
  Play,
  Phone,
  PlugZap,
  RotateCcw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  mapLiveLeads,
  completeLiveSummary,
  summarizeLiveWithDemo,
  type LiveLeadResponse,
} from "@/lib/speed-to-lead/live";
import {
  filterLeads,
  money,
  BOOKED_VALUE_LABELS,
  SOURCE_NAMES,
  SOURCES,
  STAGE_NAMES,
  summarize,
  timeAgo,
  type Filters,
  type Lead,
} from "@/lib/speed-to-lead/model";
import { useLeadDemo } from "./demo-provider";
import { LeadInbox } from "./inbox";
import { PartnerSetup } from "./partners";
import { button, input, primary, SourceMark, StageBadge } from "./pieces";
import { VoicePanel } from "./voice-panel";
export type View = "analytics" | "history" | "inbox" | "partners" | "voice";
const TABS = [
  { id: "analytics", title: "Analytics", icon: LayoutDashboard },
  { id: "history", title: "History", icon: History },
  { id: "inbox", title: "SMS Inbox", icon: Inbox },
  { id: "voice", title: "Voice", icon: Phone },
  { id: "partners", title: "Partner Setup", icon: PlugZap },
] as const;
export function LeadWorkspace({ view }: { view: View }) {
  const { state, run, reset, dispatch, isDemo } = useLeadDemo();
  const [pageCount, setPageCount] = useState(1);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [liveTotals, setLiveTotals] = useState<LiveLeadResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const router = useRouter();
  const params = useSearchParams();
  const source = SOURCES.includes(params.get("source") as (typeof SOURCES)[number])
    ? params.get("source")!
    : "all";
  const stage = Object.keys(STAGE_NAMES).includes(params.get("stage") ?? "")
    ? params.get("stage")!
    : "all";
  const days = [1, 7, 30].includes(Number(params.get("days"))) ? Number(params.get("days")) : 7;
  const filters: Filters = { source, stage, days, query: params.get("q") ?? "" };
  useEffect(() => {
    setPageCount(1);
  }, [source, days]);
  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const controller = new AbortController();
    setLoadStatus("loading");
    setLiveTotals(null);
    const load = async () => {
      if (loading || cancelled) {
        return;
      }
      loading = true;
      try {
        const rows = new Map<string, NonNullable<LiveLeadResponse["leads"]>[number]>();
        let offset: number | null = 0;
        let total = 0;
        let totals: LiveLeadResponse | null = null;
        for (let page = 0; page < pageCount && offset !== null; page++) {
          const query = new URLSearchParams({ days: String(days) });
          if (source !== "all") {
            query.set("source", source);
          }
          if (offset > 0) {
            query.set("offset", String(offset));
          }
          const res = await fetch(`/api/leads?${query}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new Error("Lead read failed");
          }
          const body = (await res.json()) as LiveLeadResponse;
          if (!Array.isArray(body.leads)) {
            throw new Error("Invalid lead response");
          }
          for (const lead of body.leads) {
            rows.set(lead.id, lead);
          }
          total = body.summary?.inquiries ?? rows.size;
          if (
            page === 0 &&
            completeLiveSummary(body.summary) &&
            body.sources &&
            Object.values(body.sources).every(completeLiveSummary)
          ) {
            totals = body;
          }
          const next = body.nextOffset ?? null;
          if (next !== null && (!Number.isSafeInteger(next) || next <= offset)) {
            throw new Error("Invalid lead page");
          }
          offset = next;
        }
        if (!cancelled) {
          dispatch({ type: "syncLive", leads: mapLiveLeads([...rows.values()]) });
          setTotalRows(total);
          setLiveTotals(totals);
          setNextOffset(offset);
          setLoadStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setLoadStatus("error");
        }
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 5000);
    const onVisible = () => {
      if (!document.hidden) {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dispatch, source, days, pageCount]);
  const cohort = filterLeads(state.leads, { ...filters, stage: "all", query: "" }, state.now);
  const leads = filterLeads(state.leads, filters, state.now);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all" || !value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete("lead");
    router.replace(`/speed-to-lead/${view}?${next}`, { scroll: false });
  }
  function openLead(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("lead", id);
    router.push(`/speed-to-lead/inbox?${next}`, { scroll: false });
  }
  function start() {
    if (source === "website") {
      return;
    }
    const id = run(source === "all" ? "google_lsa" : (source as (typeof SOURCES)[number]));
    if (!id) {
      return;
    }
    const dest = view === "voice" ? "voice" : "inbox";
    router.push(`/speed-to-lead/${dest}?lead=${id}`, { scroll: false });
  }
  function selectVoiceLead(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("lead", id);
    router.replace(`/speed-to-lead/voice?${next}`, { scroll: false });
  }
  function exportHistory() {
    const rows = [
      ["Name", "Source", "Service", "Status", "Booked USD", "Value basis", "Response seconds"],
      ...leads.map((lead) => [
        lead.name,
        SOURCE_NAMES[lead.source],
        lead.service,
        STAGE_NAMES[lead.stage],
        lead.stage === "booked" && (lead.origin !== "live" || lead.bookedValueKnown)
          ? String(lead.bookedCents / 100)
          : "",
        lead.bookedValueBasis ? BOOKED_VALUE_LABELS[lead.bookedValueBasis] : "",
        String(lead.responseSeconds ?? ""),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = isDemo ? "scout-demo-leads.csv" : "scout-leads.csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="space-y-5 pb-4">
      {isDemo && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-2xl bg-golden-tint px-4 py-3 text-body text-ink-2"
        >
          <span className="rounded-full bg-golden-soft px-2.5 py-0.5 text-label font-semibold text-ink">
            Test workspace
          </span>
          <span>
            Sample leads use scripted conversations. Leads marked Live show real partner intake and
            SMS. Bookings in this workspace use the local test CRM.
          </span>
        </div>
      )}
      {!isDemo && loadStatus === "loading" && (
        <p role="status" className="text-body text-ink-3">
          Loading leads…
        </p>
      )}
      {!isDemo && loadStatus === "error" && (
        <p role="alert" className="text-body text-alarm">
          Could not refresh leads.{" "}
          {state.leads.length ? "Showing the last successful update." : "Please try again shortly."}
        </p>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-label font-bold tracking-[0.14em] text-terracotta uppercase">
            <Zap size={13} fill="currentColor" /> Speed to Lead
          </p>
          <h1 className="greeting mt-3">
            First in. <em>Booked next.</em>
          </h1>
          <p className="mt-2 text-body-lg text-ink-3">
            Every lead. One conversation. Scout takes it from here.
          </p>
        </div>
        {isDemo && (
          <div className="flex flex-col items-stretch gap-2">
            <button
              className={primary}
              onClick={start}
              disabled={
                Boolean(state.runningId) ||
                source === "website" ||
                state.paused.includes(
                  source === "all" ? "google_lsa" : (source as (typeof SOURCES)[number]),
                )
              }
            >
              <Play size={14} fill="currentColor" />
              {state.runningId ? "Demo running…" : "Run lead demo"}
            </button>
            <button
              className={button}
              onClick={() => {
                reset();
                router.replace(`/speed-to-lead/${view}`, { scroll: false });
              }}
            >
              <RotateCcw size={15} strokeWidth={1.8} />
              Reset demo
            </button>
          </div>
        )}
      </header>
      {!isDemo && nextOffset !== null && (
        <div className="flex flex-wrap items-center gap-3 text-body text-ink-3">
          <span>
            Showing {state.leads.length} of {totalRows} leads.{" "}
            {liveTotals
              ? "Metrics cover all leads in this date range."
              : "Metrics cover the displayed leads."}
          </span>
          <button
            className={button}
            disabled={loadStatus === "loading"}
            onClick={() => setPageCount((count) => count + 1)}
          >
            Load older leads
          </button>
        </div>
      )}
      <nav aria-label="Speed to Lead" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {TABS.filter((tab) => isDemo || tab.id !== "voice").map((tab) => (
          <Link
            key={tab.id}
            href={`/speed-to-lead/${tab.id}${params.toString() ? `?${params}` : ""}`}
            aria-current={view === tab.id ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-body font-semibold transition-colors ${view === tab.id ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:bg-ink/5 hover:text-ink"}`}
          >
            <tab.icon size={17} strokeWidth={1.8} className="hidden sm:block" />
            {tab.title}
          </Link>
        ))}
      </nav>
      {view !== "partners" && view !== "voice" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Lead source</span>
            <select
              aria-label="Lead source"
              className={`${input} appearance-none pr-10`}
              value={source}
              onChange={(event) => update("source", event.target.value)}
            >
              <option value="all">All partners</option>
              {SOURCES.map((key) => (
                <option key={key} value={key}>
                  {SOURCE_NAMES[key]}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-3"
              size={16}
              strokeWidth={1.8}
            />
          </label>
          <label className="relative">
            <span className="sr-only">Date range</span>
            <CalendarDays
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3"
              size={16}
              strokeWidth={1.8}
            />
            <select
              aria-label="Date range"
              className={`${input} appearance-none pr-10 pl-11`}
              value={days}
              onChange={(event) => update("days", event.target.value)}
            >
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-3"
              size={16}
              strokeWidth={1.8}
            />
          </label>
          {view !== "analytics" && (
            <div className="flex min-w-[min(100%,18rem)] flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={17}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3"
                />
                <input
                  aria-label="Search leads"
                  className={`${input} w-full pl-11`}
                  placeholder="Search name, number, service…"
                  value={filters.query}
                  onChange={(event) => update("q", event.target.value)}
                />
              </div>
              <button
                className={`${button} w-11 px-0`}
                onClick={exportHistory}
                aria-label={isDemo ? "Export filtered demo leads" : "Export filtered leads"}
                title="Export"
              >
                <ArrowDownToLine size={18} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </div>
      )}
      {(view === "inbox" || view === "history") && (
        <div
          className="flex gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap"
          aria-label="Lead status filters"
        >
          {(["all", "booked", "unbooked", "excused", "not_delivered"] as const).map((key) => (
            <button
              key={key}
              aria-pressed={stage === key}
              onClick={() => update("stage", key)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-body font-semibold whitespace-nowrap transition-colors ${stage === key ? "bg-terracotta-tint text-terracotta-deep" : "bg-ink/6 text-ink-2 hover:text-ink"}`}
            >
              {key === "all" ? "All leads" : STAGE_NAMES[key]}{" "}
              <span className="ml-1 tabular-nums opacity-60">
                {cohort.filter((lead) => key === "all" || lead.stage === key).length}
              </span>
            </button>
          ))}
        </div>
      )}
      {view === "analytics" && (
        <Analytics
          leads={cohort}
          isDemo={isDemo}
          complete={nextOffset === null}
          liveTotals={liveTotals}
          openLead={openLead}
          openSource={(value) => {
            const next = new URLSearchParams(params.toString());
            next.set("source", value);
            router.push(`/speed-to-lead/history?${next}`, { scroll: false });
          }}
        />
      )}
      {view === "history" && <LeadHistory leads={leads} now={state.now} openLead={openLead} />}
      {view === "inbox" && (
        <LeadInbox leads={leads} selectedId={params.get("lead")} openLead={openLead} />
      )}
      {view === "voice" && isDemo && (
        <VoicePanel
          leads={state.leads}
          selectedId={params.get("lead")}
          onSelectLead={selectVoiceLead}
        />
      )}
      {view === "voice" && !isDemo && (
        <p className="text-body text-ink-3">
          Voice lead outreach is not enabled in this workspace.
        </p>
      )}
      {view === "partners" && (
        <PartnerSetup
          openLead={(id) => router.push(`/speed-to-lead/inbox?lead=${id}`, { scroll: false })}
        />
      )}
    </div>
  );
}
function Analytics({
  leads,
  isDemo,
  complete,
  liveTotals,
  openLead,
  openSource,
}: {
  leads: Lead[];
  isDemo: boolean;
  complete: boolean;
  liveTotals: LiveLeadResponse | null;
  openLead: (id: string) => void;
  openSource: (source: string) => void;
}) {
  const fullSummary = completeLiveSummary(liveTotals?.summary) ? liveTotals.summary : null;
  const stats = fullSummary
    ? summarizeLiveWithDemo(
        fullSummary,
        leads.filter((lead) => lead.origin === "demo"),
      )
    : summarize(leads);
  const metrics = [
    {
      label: complete || fullSummary ? "Total inquiries" : "Displayed inquiries",
      value: String(stats.total),
      note: "Across your connected partners",
    },
    { label: "Qualified leads", value: String(stats.qualified), note: "A good fit for your shop" },
    {
      label: "Booked leads",
      value: String(stats.booked),
      note: stats.total
        ? `${Math.round((stats.booked / stats.total) * 100)}% of inquiries booked`
        : "No inquiries in this period",
    },
    {
      label: "Booked value",
      value:
        stats.booked > 0 && stats.bookingsWithKnownValue === 0 ? "—" : money(stats.bookedCents),
      note: isDemo
        ? "Sample job value · not collections"
        : stats.booked === 0
          ? "No booked leads in this period"
          : `${stats.bookingsWithKnownValue} of ${stats.booked} valued · ${stats.estimatedBookings} estimated · not collections`,
    },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[24px] bg-paper p-4 shadow-soft sm:p-5">
            <p className="text-body font-medium text-ink-3">{metric.label}</p>
            <p className="mt-3 text-[clamp(1.65rem,3vw,2.5rem)] font-semibold leading-none tracking-tight tabular-nums text-ink">
              {metric.value}
            </p>
            <p className="mt-3 text-label leading-relaxed text-ink-3">{metric.note}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-[#81472f] px-5 py-5 text-white">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/12">
            <Zap size={22} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-label font-semibold tracking-[0.14em] text-white/70 uppercase">
              A head start on every lead
            </p>

            {stats.responseSeconds === null ? (
              <p className="mt-1 text-title font-medium">Reply time shows once a lead comes in.</p>
            ) : (
              <p className="mt-1 text-title font-medium">
                Scout replies in{" "}
                <span className="font-display text-3xl italic">{stats.responseSeconds}s</span> on
                average.
              </p>
            )}
          </div>
        </div>
      </div>
      <section className="overflow-hidden rounded-[24px] bg-paper shadow-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-2">
          <h2 className="text-body-lg font-semibold text-ink">Where the good leads come from.</h2>
          <span className="text-label text-ink-3">Same selected date range</span>
        </div>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full text-left text-body">
            <thead className="text-label text-ink-3">
              <tr>
                {["Partner", "Inquiries", "Qualified", "Booked", "Booked value", ""].map(
                  (label, i) => (
                    <th
                      key={i}
                      className={`px-3 py-2 font-medium ${i === 1 || i === 2 ? "hidden sm:table-cell" : ""}`}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((source) => {
                const sourceLeads = leads.filter((lead) => lead.source === source);
                const sourceTotals = liveTotals?.sources?.[source];
                const row = fullSummary
                  ? summarizeLiveWithDemo(
                      sourceTotals ?? {
                        inquiries: 0,
                        qualified: 0,
                        booked: 0,
                        bookedValueCents: 0,
                        bookingsWithKnownValue: 0,
                        responses: 0,
                        responseSecondsTotal: 0,
                      },
                      sourceLeads.filter((lead) => lead.origin === "demo"),
                    )
                  : summarize(sourceLeads);
                return (
                  <tr key={source} className="transition-colors hover:bg-ink/4">
                    <td className="rounded-l-2xl px-3 py-2.5">
                      <button
                        className="flex min-h-11 items-center gap-3 text-left font-semibold text-ink"
                        onClick={() => openSource(source)}
                      >
                        <SourceMark source={source} />
                        {SOURCE_NAMES[source]}
                      </button>
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink-2 tabular-nums sm:table-cell">
                      {row.total}
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink-2 tabular-nums sm:table-cell">
                      {row.qualified}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full bg-sage-tint px-2.5 py-0.5 font-semibold text-sage-deep tabular-nums">
                        {row.booked}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-ink tabular-nums">
                      {row.booked > 0 && row.bookingsWithKnownValue === 0
                        ? "—"
                        : money(row.bookedCents)}
                    </td>
                    <td className="rounded-r-2xl pr-1">
                      <button
                        onClick={() => openSource(source)}
                        aria-label={`View ${SOURCE_NAMES[source]} leads`}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-ink/6 hover:text-ink"
                      >
                        <ArrowRight size={17} strokeWidth={1.8} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-[24px] bg-paper p-5 shadow-soft">
        <h2 className="flex items-center gap-2 text-body-lg font-semibold text-ink">
          <Sparkles size={18} strokeWidth={1.8} className="text-terracotta" /> Conversations worth a
          look
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {leads.slice(0, 3).map((lead) => (
            <button
              key={lead.id}
              onClick={() => openLead(lead.id)}
              className="rounded-2xl bg-ink/4 p-4 text-left transition-colors hover:bg-ink/7"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-body font-semibold text-ink">{lead.name}</p>
                <StageBadge stage={lead.stage} />
              </div>
              <p className="mt-0.5 text-label text-ink-3">
                {SOURCE_NAMES[lead.source]} · {lead.service}
              </p>
              <p className="mt-3 line-clamp-2 text-body leading-relaxed text-ink-2">
                {lead.messages.at(-1)?.text}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-label font-semibold text-terracotta-deep">
                Open conversation <ArrowRight size={14} strokeWidth={1.8} />
              </span>
            </button>
          ))}
        </div>
        {!leads.length && (
          <p className="mt-4 text-body text-ink-3">No sample leads match these filters.</p>
        )}
      </section>
    </div>
  );
}
function LeadHistory({
  leads,
  now,
  openLead,
}: {
  leads: Lead[];
  now: number;
  openLead: (id: string) => void;
}) {
  return (
    <section className="rounded-[24px] bg-paper p-2 shadow-soft">
      <header className="flex items-baseline justify-between px-3 pt-3 pb-2">
        <h2 className="text-body-lg font-semibold text-ink">Every lead has a story.</h2>
        <span className="text-label text-ink-3">{leads.length} inquiries</span>
      </header>
      {leads.map((lead) => (
        <button
          key={lead.id}
          onClick={() => openLead(lead.id)}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-ink/4"
        >
          <SourceMark source={lead.source} />
          <div className="min-w-[150px] flex-1">
            <p className="text-body font-semibold text-ink">{lead.name}</p>
            <p className="mt-0.5 text-label text-ink-3">
              {lead.service} · {SOURCE_NAMES[lead.source]}
              {lead.origin === "live" ? " · Live lead" : ""}
            </p>
          </div>
          <StageBadge stage={lead.stage} />
          <div className="min-w-[80px] text-label text-ink-3">
            <p className="flex items-center gap-1">
              <Clock3 size={13} strokeWidth={1.8} />
              {lead.responseSeconds === null ? "No delivery" : `${lead.responseSeconds}s response`}
            </p>
            <p className="mt-0.5">{timeAgo(lead.inquiryAt ?? lead.receivedAt, now)}</p>
          </div>
          <span className="ml-auto w-24 text-right text-body font-semibold text-ink tabular-nums">
            {lead.stage === "booked" ? (
              lead.origin === "live" && !lead.bookedValueKnown ? (
                lead.bookedValueBasis ? (
                  BOOKED_VALUE_LABELS[lead.bookedValueBasis]
                ) : (
                  "Value pending"
                )
              ) : (
                <>
                  {money(lead.bookedCents)}
                  {lead.bookedValueBasis && (
                    <small className="block text-label font-normal text-ink-3">
                      {BOOKED_VALUE_LABELS[lead.bookedValueBasis]}
                    </small>
                  )}
                </>
              )
            ) : (
              "—"
            )}
          </span>
          <ArrowRight size={16} strokeWidth={1.8} className="text-ink-3" />
        </button>
      ))}
      {!leads.length && (
        <p className="px-5 py-10 text-center text-body text-ink-3">
          No leads match. Try another source, status, or search.
        </p>
      )}
    </section>
  );
}
