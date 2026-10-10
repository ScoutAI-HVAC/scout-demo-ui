import {
  DEFAULT_BUSINESS_DAYS,
  getCallHandler,
  getEscalation,
  getNotifications,
  readScoutConfig,
} from "@/lib/scouthvac-config";
import { scoutImpact } from "@/lib/scout-impact";
export const dynamic = "force-dynamic";
const DAY_MS = 86400000;
async function settings(): Promise<any> {
  const config = await readScoutConfig();
  const company = config?.company ?? {};
  const hours = company.businessHours ?? {};
  return {
    company: {
      name: company.name ?? "",
      phone: company.phone ?? "",
      trade: company.trade ?? "hvac",
      serviceArea: {
        mode: "list",
        radiusMiles: 25,
        centerAddress: company.address ?? "",
        locations: Array.isArray(company.serviceArea) ? company.serviceArea : [],
        notes: "",
        summary: Array.isArray(company.serviceArea) ? company.serviceArea.join(", ") : "",
      },
      businessHours: `${hours.start ?? "08:00"} - ${hours.end ?? "17:00"}`,
      hours: {
        start: hours.start ?? "08:00",
        end: hours.end ?? "17:00",
        timezone: hours.timezone ?? "America/Chicago",
        emergencyAfterHours: true,
        days: DEFAULT_BUSINESS_DAYS,
        closedDates: [],
      },
      emergencyExamples: "",
    },
    techs: [],
    services: [],
    knowledge: [],
    callCenter: { takeoverPhone: "", ownerPhoneLastFour: null },
    callHandler: getCallHandler(config),
    escalation: getEscalation(config),
    fees: { minBookingNoticeHours: 0 },
    notifications: getNotifications(config),
    bookingWindows: [],
    voiceOptions: [],
  };
}
function window(days = 30) {
  const now = Date.now();
  return { sinceMs: now - days * DAY_MS, generatedAtMs: now };
}
const emptyImpact = () =>
  scoutImpact({
    collected: { items: [] },
    won: { items: [] },
    voice: {
      items: [],
      trackedBookings: 0,
      unpricedBookings: 0,
      unreadBookings: 0,
      omittedBookings: 0,
      asOfMs: Date.now(),
    },
  });
const ZERO_CALLS = {
  totalCalls: 0,
  answered: 0,
  booked: 0,
  escalated: 0,
  spam: 0,
  deadAir: 0,
  noConnect: 0,
  afterHours: 0,
  uniqueCallers: 0,
  avgDurationSec: 0,
  totalDurationSec: 0,
};
const EMPTY: Array<[RegExp, (url: URL) => unknown | Promise<unknown>]> = [
  [/^scout-impact$/, () => emptyImpact()],
  [/^activity$/, () => ({ events: [] })],
  [/^insights$/, () => ({ insights: [] })],
  [/^service-status$/, () => ({ status: "checked" })],
  [/^build$/, () => ({ id: process.env.SCOUT_BUILD_ID ?? "demo" })],
  [/^health$/, () => ({ ok: true })],
  [/^chat$/, () => ({ messages: [] })],
  [/^chat\/threads$/, () => ({ threads: [] })],
  [/^inbox$/, () => ({ conversations: [], total: 0, next: null })],
  [/^inbox\/campaigns$/, () => ({ campaigns: [] })],
  [/^inbox\/search$/, () => ({ conversations: [], results: [] })],
  [/^inbox\/thread$/, () => ({ messages: [] })],
  [/^calls$/, () => ({ calls: [], total: 0 })],
  [/^calls\/active$/, () => ({ calls: [], runtimeUp: true })],
  [
    /^calls\/stats$/,
    (url) => ({ days: Number(url.searchParams.get("days") ?? 30), ...ZERO_CALLS }),
  ],
  [
    /^calls\/booked-value$/,
    (url) => ({
      days: Number(url.searchParams.get("days") ?? 30),
      total: 0,
      trackedBookings: 0,
      unpricedBookings: 0,
      pendingBookings: 0,
    }),
  ],
  [
    /^flows$/,
    () => ({
      flows: [],
      engineReachable: true,
      health: {
        everTicked: true,
        lastTickAgoMs: 5 * 60000,
        tickIntervalMs: 15 * 60000,
        lastTick: { ok: true, touchesSent: 0, touchesSkipped: 0 },
      },
    }),
  ],
  [/^flows\/suggestions$/, () => ({ suggestions: [], ideas: [] })],
  [
    /^flows\/report$/,
    () => ({
      ...window(),
      flows: [],
      totals: { touchesSent: 0, touchesSkipped: 0, ticks: 0, failedTicks: 0, refusals: {} },
      smsVolume: null,
    }),
  ],
  [/^flows\/(collected|won)$/, () => ({ items: [], total: 0 })],
  [
    /^report$/,
    () => ({
      ...window(),
      windowDays: 30,
      impact: emptyImpact(),
      flows: { flows: [], totals: { touchesSent: 0 }, smsVolume: null },
      calls: ZERO_CALLS,
      escalations: { total: 0, byReason: {} },
    }),
  ],
  [/^leads$/, () => ({ leads: [], nextOffset: null, summary: { inquiries: 0 }, sources: {} })],
  [/^settings$/, settings],
  [/^technicians$/, () => ({ technicians: [], crmReachable: true })],
  [/^auth\/openai-codex\/status$/, () => ({ connected: true })],
];
async function answer(request: Request, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const key = path.join("/");
  if (request.method !== "GET") {
    if (key === "chat") {
      const body = `data: ${JSON.stringify({ done: true })}\n\n`;
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({ ok: true, success: true });
  }
  // One campaign by id: there are none, so it is not found (the page says so).
  if (/^flows\/flow-[^/]+$/.test(key) || (/^flows\/[^/]+$/.test(key) && !EMPTY.some(([p]) => p.test(key)))) {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  for (const [pattern, build] of EMPTY) {
    if (pattern.test(key)) {
      return Response.json(await build(url));
    }
  }
  return Response.json({});
}
type Ctx = {
  params: Promise<{
    path: string[];
  }>;
};
const handler = async (request: Request, { params }: Ctx) => answer(request, (await params).path);
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
