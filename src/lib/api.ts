import { sentenceCase } from "./pro-case";
function getApiBase(): string {
  if (typeof window !== "undefined") return "/api";
  const port = process.env.PORT ?? "3000";
  const host = `http://localhost:${port}`;
  return `${host.replace(/\/+$/, "")}/api`;
}
export type CallOutcome =
  | "booked"
  | "escalated"
  | "no-connect"
  | "spam"
  | "dead-air"
  | "answered"
  | "unresolved";
export type CallStatus = "in-progress" | "completed" | "failed";
export type CallDirection = "inbound" | "outbound";
export interface CallTurn {
  speaker: "scout" | "caller";
  text: string;
  timestamp?: string;
}
export interface CallToolCall {
  name: string;
  arguments?: Record<string, unknown> | string;
  result?: string;
  timestamp?: string;
}
export interface Call {
  completedActions?: Array<{
    kind:
      | "booking_created"
      | "booking_existing"
      | "request_created"
      | "confirmation_sent"
      | "customer_text_sent"
      | "visit_rescheduled"
      | "followup_requested";
    at: string;
    reference?: string;
  }>;
  bookingProof?:
    | {
        state: "unavailable" | "unsupported" | "pending";
        jobId: string;
      }
    | {
        state: "verified";
        jobId: string;
        checkedAt: string;
        date: string;
        timeSlot: string;
        status: string;
        technicians: Array<{
          id: string;
          name?: string;
        }>;
      };
  id: string;
  customerId?: string;
  callerPhone: string;
  callerName?: string;
  serviceAddress?: string;
  customerMatchStatus?:
    | "exact_phone"
    | "matched"
    | "ambiguous"
    | "created"
    | "no_match"
    | "incomplete";
  customerMatchCandidates?: Array<{
    id: string;
    name: string;
    phone: string;
    email?: string;
    address: string;
  }>;
  direction: CallDirection;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  endedReason?: string;
  summary?: string;
  transcript?: string;
  turns?: CallTurn[];
  recordingUrl?: string;
  outcome?: CallOutcome;
  unresolvedReason?: string;
  afterHours?: boolean;
  emergency?: boolean;
  emergencySeverity?: "urgent" | "critical";
  emergencyReason?: string;
  jobId?: string;
  callbackCallId?: string;
  callbackRequestedAt?: string;
  reviewedAt?: string;
  callbackResolvedAt?: string;
  callbackResolvedVia?: "manual" | "outbound_call" | "inbound_call" | "sms";
  needsAttention?: boolean;
  callCenterActions?: Array<{
    action: "listen" | "whisper" | "take-over" | "callback";
    at: string;
    status: "succeeded" | "failed";
    detail?: string;
  }>;
  crmSync?: {
    status: "synced" | "unsupported" | "no_anchor" | "failed" | "skipped";
    target?: "job" | "customer";
    targetId?: string;
    attemptedAt: string;
    detail?: string;
  };
  status: CallStatus;
  address?: string;
  toolCalls?: CallToolCall[];
  messages?: Array<Record<string, unknown>>;
}
export interface DrawerCustomer {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}
export interface DrawerJob {
  id: string;
  date?: string;
  timeSlot?: string;
  techId?: string;
  techName?: string;
  jobType?: string;
  status?: string;
  notes?: string;
  customerName?: string;
  address?: string;
}
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      sentenceCase(body.error || "") || `Something went wrong (${res.status}). Try again.`,
    );
  }
  return res.json();
}
export interface CallHistoryFilters {
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
  range?: "today";
  attention?: boolean;
}
export interface CallHistoryPage {
  calls: Call[];
  total: number;
  namesIncomplete: boolean;
}
export interface ActiveCalls {
  calls: Call[];
  runtimeUp: boolean;
}
export async function fetchActiveCalls(): Promise<ActiveCalls> {
  const data = await apiFetch<{
    calls: Call[];
    runtimeUp?: boolean;
  }>("/calls/active");
  return { calls: data.calls, runtimeUp: data.runtimeUp !== false };
}
export type CallCenterControlAction = "listen" | "whisper" | "take-over" | "callback";
export type CallCenterControlRequestAction = CallCenterControlAction | "take-over-preview";
export interface CallCenterControlResponse {
  ok: true;
  listenUrl?: string;
  audio?: {
    encoding: "pcm_s16le";
    sampleRate: number;
    channels: number;
  };
  callId?: string;
  status?: string;
  duplicate?: boolean;
  destinationLastFour?: string;
  destinationSource?: "test" | "configured" | "owner";
}
export async function controlCall(
  callId: string,
  action: CallCenterControlRequestAction,
  message?: string,
): Promise<CallCenterControlResponse> {
  return apiFetch<CallCenterControlResponse>(`/calls/${encodeURIComponent(callId)}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(message ? { message } : {}) }),
  });
}
export async function fetchCallHistory(filters: CallHistoryFilters = {}): Promise<CallHistoryPage> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.q) params.set("q", filters.q);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  if (filters.range) params.set("range", filters.range);
  if (filters.attention) params.set("attention", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<{
    calls: Call[];
    total?: number;
    namesIncomplete?: boolean;
  }>(`/calls${qs}`);
  return {
    calls: data.calls,
    total: data.total ?? data.calls.length,
    namesIncomplete: data.namesIncomplete === true,
  };
}
export async function fetchCall(id: string): Promise<Call> {
  return apiFetch<Call>(`/calls/${encodeURIComponent(id)}`);
}
export async function resolveCallback(id: string): Promise<Call> {
  return apiFetch<Call>(`/calls/${encodeURIComponent(id)}/resolve-callback`, {
    method: "POST",
  });
}
export interface CallStats {
  days: number;
  totalCalls: number;
  answered: number;
  booked: number;
  escalated: number;
  spam: number;
  deadAir: number;
  noConnect: number;
  uniqueCallers: number;
  avgDurationSec: number;
  totalDurationSec: number;
  unclassifiedCalls?: number;
  sentToTeam?: number;
  transferred?: number;
  texted?: number;
  transferUntracked?: number;
}
export async function fetchCallStats(days = 30): Promise<CallStats> {
  return apiFetch<CallStats>(`/calls/stats?days=${days}`);
}
export interface CallBookedValue {
  days: number;
  total: number;
  trackedBookings: number | null;
  unpricedBookings: number | null;
  pendingBookings: number;
  undatedBookings: number;
  partial: boolean;
}
export async function fetchCallBookedValue(days = 30): Promise<CallBookedValue> {
  const value = await apiFetch<CallBookedValue>(`/calls/booked-value?days=${days}`);
  if (!Number.isFinite(value.total) || value.total < 0) {
    throw new Error("Phone booking value is unavailable");
  }
  return value;
}
export async function linkCallToCustomer(callId: string, customerId: string): Promise<Call> {
  return apiFetch<Call>(`/calls/${encodeURIComponent(callId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId }),
  });
}
export async function markCallReviewed(callId: string): Promise<Call> {
  return apiFetch<Call>(`/calls/${encodeURIComponent(callId)}/review`, {
    method: "POST",
  });
}
export async function fetchCustomerById(id: string): Promise<DrawerCustomer | null> {
  try {
    const data = await apiFetch<{
      customer?: DrawerCustomer;
    }>(`/customers?id=${encodeURIComponent(id)}`);
    return data.customer ?? null;
  } catch {
    return null;
  }
}
export async function fetchCustomerByPhone(phone: string): Promise<DrawerCustomer | null> {
  try {
    const data = await apiFetch<{
      customer?: DrawerCustomer;
    }>(`/customers?phone=${encodeURIComponent(phone)}`);
    return data.customer ?? null;
  } catch {
    return null;
  }
}
export async function fetchJobById(id: string): Promise<DrawerJob | null> {
  try {
    const data = await apiFetch<{
      job?: {
        id: string;
        scheduledDate?: string;
        scheduledTimeSlot?: string;
        techId?: string;
        techName?: string;
        type?: string;
        jobType?: string;
        status?: string;
        priority?: string;
        notes?: string;
        customerName?: string;
        address?: string;
      };
    }>(`/schedule/jobs/${encodeURIComponent(id)}`);
    const job = data.job;
    if (!job) return null;
    return {
      id: job.id,
      date: job.scheduledDate,
      timeSlot: job.scheduledTimeSlot,
      techId: job.techId,
      techName: job.techName,
      jobType: job.jobType ?? job.type,
      status: job.status ?? job.priority,
      notes: job.notes,
      customerName: job.customerName,
      address: job.address,
    };
  } catch {
    return null;
  }
}
