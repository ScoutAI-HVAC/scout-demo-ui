import type { BookingWindow } from "@/lib/booking-windows";
import type {
  BookingNoticeHours,
  BusinessDays,
  CallHandlerSettings,
  EscalationSettings,
  NotificationSettings,
  Weekday,
} from "@/lib/scouthvac-config";
import type { ServiceAreaSettings } from "@/lib/service-area";
import type { ShopTrade } from "@/lib/shop-trades";
import { sentenceCase } from "./pro-case";
export type {
  BookingNoticeHours,
  BusinessDays,
  CallHandlerSettings,
  EscalationSettings,
  NotificationSettings,
  Weekday,
};
function getApiBase(): string {
  if (typeof window !== "undefined") return "/api";
  const port = process.env.PORT ?? "3000";
  const host = `http://localhost:${port}`;
  return `${host.replace(/\/+$/, "")}/api`;
}
export interface Tech {
  id: string;
  name: string;
  avatar?: string;
  phone: string;
  specialties: string[];
}
export interface BusinessHoursSettings {
  start: string;
  end: string;
  timezone: string;
  emergencyAfterHours: boolean;
  days: BusinessDays;
  closedDates: string[];
}
export interface CompanyInfo {
  name: string;
  phone: string;
  serviceArea: ServiceAreaSettings & {
    summary: string;
  };
  businessHours: string;
  hours: BusinessHoursSettings;
  emergencyExamples: string;
  trade: ShopTrade;
}
export interface Service {
  id: string;
  name: string;
  basePrice: number;
  financingAvailable: boolean;
}
export interface KnowledgeEntry {
  id: string;
  key: string;
  topic: string;
  content: string;
  source: string;
  savedAt?: string;
}
export interface CallCenterSettings {
  takeoverPhone: string;
  ownerPhoneLastFour: string | null;
}
export interface PhoneSyncStatus {
  id: string;
  state: "retrying" | "applied" | "failed" | "skipped" | "unknown";
  reason?: string;
  superseded?: boolean;
  refusal?: string;
}
export interface SettingsResponse {
  company: CompanyInfo;
  techs: Tech[];
  services: Service[];
  knowledge: KnowledgeEntry[];
  callCenter: CallCenterSettings;
  callHandler: CallHandlerSettings;
  escalation: EscalationSettings;
  fees: {
    diagnosticFee?: number;
    emergencySurcharge?: number;
    paymentUrl?: string;
    minBookingNoticeHours: BookingNoticeHours;
  };
  notifications: NotificationSettings;
  bookingWindows?: BookingWindow[];
  voiceOptions: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  phoneSync?: PhoneSyncStatus;
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
export interface SettingsSaveResult {
  success: boolean;
  settings: SettingsResponse;
  callHandlerPush?:
    | "ok"
    | "skipped"
    | {
        failed: string;
      };
  phoneSync?: PhoneSyncStatus;
}
export async function fetchSettings(): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>("/settings");
}
export async function fetchCompanyInfo(): Promise<CompanyInfo> {
  return (await fetchSettings()).company;
}
export async function fetchTechs(): Promise<Tech[]> {
  return (await fetchSettings()).techs;
}
export async function fetchKnowledge(): Promise<KnowledgeEntry[]> {
  return (await fetchSettings()).knowledge;
}
export async function fetchCallHandler(): Promise<CallHandlerSettings> {
  return (await fetchSettings()).callHandler;
}
export async function fetchEscalationSettings(): Promise<EscalationSettings> {
  return (await fetchSettings()).escalation;
}
export async function updateSettingsSection(
  section: keyof SettingsResponse,
  data: unknown,
): Promise<SettingsSaveResult> {
  return apiFetch<SettingsSaveResult>("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [section]: data }),
  });
}
export async function saveBookingWindows(
  windows: BookingWindow[],
  base: BookingWindow[],
): Promise<SettingsSaveResult> {
  return apiFetch<SettingsSaveResult>("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingWindows: windows, bookingWindowsBase: base }),
  });
}
export type KnowledgeChange =
  | {
      op: "upsert";
      topic: string;
      content: string;
      replaces?: string;
    }
  | {
      op: "remove";
      key: string;
    };
export async function saveKnowledgeChange(change: KnowledgeChange): Promise<SettingsSaveResult> {
  return apiFetch<SettingsSaveResult>("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ knowledgeChange: change }),
  });
}
export async function resyncPhone(): Promise<SettingsSaveResult> {
  return apiFetch<SettingsSaveResult>("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resync: true }),
  });
}
export async function fetchPhoneSync(id: string): Promise<PhoneSyncStatus> {
  const body = await apiFetch<{
    phoneSync: PhoneSyncStatus;
  }>(`/settings/phone-sync?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  return body.phoneSync;
}
