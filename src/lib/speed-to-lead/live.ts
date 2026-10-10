import type { BookedValueBasis, Lead, Message, Source, Stage } from "./model";
type LiveLeadContact =
  | {
      kind: "sms";
      phone: string;
    }
  | {
      kind: "provider";
      conversationId: string;
    }
  | {
      kind: "unavailable";
      reason: string;
    };
type LiveLeadRow = {
  id: string;
  source: string;
  name: string;
  service: string;
  request: string;
  contact: LiveLeadContact;
  receivedAt: number;
  conversationEndAt?: number | null;
  providerOccurredAt: number | null;
  status: string;
  reason: string | null;
  firstResponse: {
    body: string;
    acceptedAt: number;
    messageSid: string;
  } | null;
  qualification: {
    qualified: boolean;
    evidence: string;
  } | null;
  booking: {
    jobId: string;
    confirmedAt: number;
    valueCents: number | null;
    valueBasis?: BookedValueBasis;
  } | null;
};
export type LiveLeadResponse = {
  leads?: LiveLeadRow[];
  nextOffset?: number | null;
  summary?: {
    inquiries: number;
  } & Partial<LiveLeadSummary>;
  sources?: Partial<Record<Source, LiveLeadSummary>>;
};
export type LiveLeadSummary = {
  inquiries: number;
  qualified: number;
  booked: number;
  bookedValueCents: number;
  bookingsWithKnownValue: number;
  estimatedBookings?: number;
  responses: number;
  responseSecondsTotal: number;
};
export function completeLiveSummary(value: LiveLeadResponse["summary"]): value is LiveLeadSummary {
  return Boolean(
    value &&
    [
      "inquiries",
      "qualified",
      "booked",
      "bookedValueCents",
      "bookingsWithKnownValue",
      "responses",
      "responseSecondsTotal",
    ].every((key) => {
      const field = value[key as keyof LiveLeadSummary];
      return typeof field === "number" && Number.isFinite(field) && field >= 0;
    }),
  );
}
export function summarizeLiveWithDemo(summary: LiveLeadSummary, demo: Lead[]) {
  const booked = demo.filter((lead) => lead.stage === "booked");
  const responded = demo.filter((lead) => lead.responseSeconds !== null);
  const responses = summary.responses + responded.length;
  return {
    total: summary.inquiries + demo.length,
    qualified: summary.qualified + demo.filter((lead) => lead.qualified).length,
    booked: summary.booked + booked.length,
    estimatedBookings:
      (summary.estimatedBookings ?? 0) +
      booked.filter((lead) => lead.bookedValueBasis === "job_type_estimate").length,
    bookedCents: summary.bookedValueCents + booked.reduce((sum, lead) => sum + lead.bookedCents, 0),
    bookingsWithKnownValue: summary.bookingsWithKnownValue + booked.length,
    responseSeconds: responses
      ? Math.round(
          (summary.responseSecondsTotal +
            responded.reduce((sum, lead) => sum + lead.responseSeconds!, 0)) /
            responses,
        )
      : null,
  };
}
function isSource(value: string): value is Source {
  return ["google_lsa", "meta", "thumbtack", "angi", "yelp", "website"].includes(value);
}
function stageFor(row: LiveLeadRow): Stage {
  if (row.booking) {
    return "booked";
  }
  if (row.status === "uncertain") {
    return "not_delivered";
  }
  if (
    row.status === "held" ||
    row.status === "cancelled" ||
    row.reason === "call_requires_disposition" ||
    row.reason === "native_transport_required"
  ) {
    return "excused";
  }
  return "unbooked";
}
function phoneLabel(contact: LiveLeadContact): string {
  if (contact.kind === "sms") {
    return contact.phone;
  }
  if (contact.kind === "provider") {
    return "Provider message thread";
  }
  return "Contact unavailable";
}
function areaLabel(contact: LiveLeadContact): string {
  if (contact.kind === "sms") {
    return "Live ledger";
  }
  if (contact.kind === "provider") {
    return "Provider thread";
  }
  return "No direct reply path";
}
function leadTags(row: LiveLeadRow): string[] {
  const tags = ["Live lead"];
  if (row.contact.kind === "provider") {
    tags.push("Provider thread");
  }
  if (row.qualification?.qualified) {
    tags.push("Qualified");
  }
  if (row.booking) {
    tags.push("Booked");
  }
  return tags;
}
function leadMessages(row: LiveLeadRow): Message[] {
  const receivedAt = row.receivedAt;
  const firstText = row.request.trim() || "New paid lead received.";
  const messages: Message[] = [
    {
      id: `live-${row.id}-customer`,
      speaker: "customer",
      text: firstText,
      at: row.providerOccurredAt ?? receivedAt,
    },
  ];
  if (row.firstResponse) {
    messages.push({
      id: row.firstResponse.messageSid || `live-${row.id}-first-response`,
      speaker: "scout",
      text: row.firstResponse.body,
      at: row.firstResponse.acceptedAt,
      delivery: "sent",
    });
  }
  return messages;
}
function responseHold(row: LiveLeadRow): string | undefined {
  if (row.contact.kind === "provider" || row.status !== "held") {
    return undefined;
  }
  switch (row.reason) {
    case "contact_permission_denied":
      return "Texting permission was declined. No automatic message was sent.";
    case "contact_permission_unknown":
      return "Texting permission is missing. No automatic message was sent.";
    case "historical_import":
    case "stale_inquiry":
      return "Earlier inquiry. Scout has not sent an automatic follow-up.";
    case "same_phone_open_conversation":
      return "Already in conversation. Scout did not send another introduction.";
    default:
      return "Automatic outreach is on hold for this lead.";
  }
}
export function mapLiveLead(row: LiveLeadRow): Lead | null {
  if (!isSource(row.source) || !Number.isSafeInteger(row.receivedAt) || row.receivedAt <= 0) {
    return null;
  }
  const receivedAt = row.receivedAt;
  return {
    id: `live-${row.id}`,
    origin: "live",
    googleThreadId:
      row.source === "google_lsa" && row.contact.kind === "provider" ? row.id : undefined,
    name: row.name.trim() || "Live lead",
    phone: phoneLabel(row.contact),
    source: row.source,
    stage: stageFor(row),
    service: row.service.trim() || "New paid lead",
    area: areaLabel(row.contact),
    receivedAt,
    inquiryAt: row.providerOccurredAt ?? receivedAt,
    conversationEndAt: row.conversationEndAt ?? undefined,
    responseSeconds: row.firstResponse
      ? Math.max(0, Math.round((row.firstResponse.acceptedAt - receivedAt) / 1000))
      : null,
    qualified: row.booking !== null || row.qualification?.qualified === true,
    bookedCents: row.booking?.valueCents ?? 0,
    bookedValueKnown: row.booking != null && row.booking.valueCents !== null,
    bookedValueBasis: row.booking?.valueBasis,
    tags: leadTags(row),
    reviewed: false,
    owner: "scout",
    responseHold: responseHold(row),
    messages: leadMessages(row),
    appointment: row.booking ? "Live booking recorded" : undefined,
  };
}
export function mapLiveLeads(rows: LiveLeadRow[] | undefined): Lead[] {
  return (rows ?? [])
    .map(mapLiveLead)
    .filter((lead): lead is Lead => lead !== null)
    .toSorted((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id));
}
