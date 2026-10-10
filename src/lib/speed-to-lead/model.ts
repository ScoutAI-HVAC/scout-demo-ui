export const SOURCES = ["google_lsa", "meta", "thumbtack", "angi", "yelp", "website"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_NAMES: Record<Source, string> = {
  google_lsa: "Google LSA",
  meta: "Meta Leads",
  thumbtack: "Thumbtack",
  angi: "Angi",
  yelp: "Yelp",
  website: "Website",
};
export type Stage = "booked" | "unbooked" | "excused" | "not_delivered";
export const STAGE_NAMES: Record<Stage, string> = {
  booked: "Booked",
  unbooked: "Unbooked",
  excused: "Excused",
  not_delivered: "Not delivered",
};
export type Message = {
  id: string;
  speaker: "scout" | "customer" | "owner";
  text: string;
  at: number;
  delivery?: "sending" | "sent" | "delivered" | "failed";
};
export type BookedValueBasis =
  | "invoice"
  | "accepted_quote"
  | "job_type_estimate"
  | "unpriced"
  | "cancelled"
  | "unavailable";
export const BOOKED_VALUE_LABELS: Record<BookedValueBasis, string> = {
  invoice: "Invoice value",
  accepted_quote: "Accepted quote",
  job_type_estimate: "Estimated",
  unpriced: "Needs pricing",
  cancelled: "Canceled",
  unavailable: "Value unavailable",
};
export type Lead = {
  id: string;
  origin: "demo" | "live";
  name: string;
  phone: string;
  source: Source;
  stage: Stage;
  service: string;
  area: string;
  receivedAt: number;
  inquiryAt?: number;
  responseSeconds: number | null;
  qualified: boolean;
  bookedCents: number;
  bookedValueKnown?: boolean;
  bookedValueBasis?: BookedValueBasis;
  tags: string[];
  reviewed: boolean;
  owner: "scout" | "you";
  messages: Message[];
  appointment?: string;
  conversationEndAt?: number;
  googleThreadId?: string;
  responseHold?: string;
};
export type Filters = {
  source: string;
  stage: string;
  days: number;
  query: string;
};
export function filterLeads(leads: Lead[], filters: Filters, now: number): Lead[] {
  const query = filters.query.trim().toLowerCase();
  return leads
    .filter(
      (lead) =>
        (filters.source === "all" || lead.source === filters.source) &&
        (filters.stage === "all" || lead.stage === filters.stage) &&
        (lead.inquiryAt ?? lead.receivedAt) >= now - filters.days * 86400000 &&
        (!query ||
          `${lead.name} ${lead.phone} ${lead.service} ${SOURCE_NAMES[lead.source]}`
            .toLowerCase()
            .includes(query)),
    )
    .toSorted((a, b) => (b.inquiryAt ?? b.receivedAt) - (a.inquiryAt ?? a.receivedAt));
}
export function summarize(leads: Lead[]) {
  const answered = leads.filter((lead) => lead.responseSeconds !== null);
  const booked = leads.filter((lead) => lead.stage === "booked");
  return {
    total: leads.length,
    qualified: leads.filter((lead) => lead.qualified).length,
    booked: booked.length,
    estimatedBookings: booked.filter((lead) => lead.bookedValueBasis === "job_type_estimate")
      .length,
    bookingsWithKnownValue: booked.filter(
      (lead) => lead.origin !== "live" || lead.bookedValueKnown === true,
    ).length,
    bookedCents: booked.reduce((sum, lead) => sum + lead.bookedCents, 0),
    responseSeconds: answered.length
      ? Math.round(answered.reduce((sum, lead) => sum + lead.responseSeconds!, 0) / answered.length)
      : null,
  };
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export function timeAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
