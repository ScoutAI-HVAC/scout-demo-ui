import shop from "../../shop.json";
import { normalizeShopTrade } from "./shop-trades";
export async function readScoutConfig(): Promise<any> {
  return shop;
}
export interface CallHandlerSettings {
  greeting: string;
  voiceId: string;
  customVoice?: {
    provider: string;
    voiceId: string;
    model?: string;
  };
  voicePicked?: boolean;
  tunedVoice?: {
    provider: string;
    voiceId: string;
    model?: string;
  };
  voiceMatchUnavailable?: boolean;
  tone: "friendly" | "professional" | "direct";
  afterHoursEnabled: boolean;
  mentionSurcharge: boolean;
  model: "gpt-4.1-mini" | "gpt-4.1" | "gpt-5.6-sol" | "gpt-5.6-terra";
}
export const DEFAULT_CALL_HANDLER: CallHandlerSettings = {
  greeting: "Hi, {company}. How can I help?",
  voiceId: "dean",
  tone: "friendly",
  afterHoursEnabled: true,
  mentionSurcharge: false,
  model: "gpt-4.1-mini",
};
export function getCallHandler(config: any): CallHandlerSettings {
  const stored = config?.integrations?.vapi?.callHandler ?? {};
  return {
    ...DEFAULT_CALL_HANDLER,
    ...stored,
  };
}
export const BOOKING_NOTICE_OPTIONS = [0, 24, 48, 72] as const;
export type BookingNoticeHours = (typeof BOOKING_NOTICE_OPTIONS)[number];
export interface ServicesSettings {
  minBookingNoticeHours: BookingNoticeHours;
  diagnosticFee?: number;
  emergencySurcharge?: number;
  paymentUrl?: string;
}
export function getServices(config: any): ServicesSettings {
  const stored = config?.services ?? {};
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const url = typeof stored.paymentUrl === "string" ? stored.paymentUrl.trim() : "";
  return {
    diagnosticFee: num(stored.diagnosticFee),
    emergencySurcharge: num(stored.emergencySurcharge),
    minBookingNoticeHours: BOOKING_NOTICE_OPTIONS.includes(stored.minBookingNoticeHours)
      ? (stored.minBookingNoticeHours as BookingNoticeHours)
      : 0,
    ...(url ? { paymentUrl: url } : {}),
  };
}
export interface NotificationSettings {
  textOnBooking: boolean;
  textAfterCall: boolean;
  textCustomerOnBooking: boolean;
  textTechOnBooking: boolean;
  twoWaySchedulingTexts: boolean;
}
export function getNotifications(config: any): NotificationSettings {
  const stored = config?.notifications ?? {};
  return {
    textOnBooking: stored.textOnBooking === true,
    textAfterCall: stored.textAfterCall === true,
    textCustomerOnBooking: stored.textCustomerOnBooking !== false,
    textTechOnBooking: stored.textTechOnBooking !== false,
    twoWaySchedulingTexts: stored.twoWaySchedulingTexts === true,
  };
}
export interface EscalationSettings {
  mode: "sms" | "transfer";
  transferNumber: string;
  transferMessage: string;
  ownerPhone: string;
  additionalPhones: string[];
  afterHoursOwnerAlerts: boolean;
}
export const DEFAULT_ESCALATION: EscalationSettings = {
  mode: "sms",
  transferNumber: "",
  transferMessage: "",
  ownerPhone: "",
  additionalPhones: [],
  afterHoursOwnerAlerts: true,
};
export function getEscalation(config: any): EscalationSettings {
  const stored = config?.escalation ?? {};
  return {
    mode: stored.mode === "transfer" ? "transfer" : "sms",
    transferNumber: typeof stored.transferNumber === "string" ? stored.transferNumber : "",
    transferMessage: typeof stored.transferMessage === "string" ? stored.transferMessage : "",
    ownerPhone: typeof stored.ownerPhone === "string" ? stored.ownerPhone : "",
    additionalPhones: Array.isArray(stored.additionalPhones)
      ? stored.additionalPhones.filter(
          (p: unknown): p is string => typeof p === "string" && p !== "",
        )
      : [],
    afterHoursOwnerAlerts: stored.afterHoursOwnerAlerts !== false,
  };
}
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export interface BusinessDay {
  open: boolean;
  start?: string;
  end?: string;
}
export type BusinessDays = Record<Weekday, BusinessDay>;
export const DEFAULT_BUSINESS_DAYS: BusinessDays = {
  monday: { open: true },
  tuesday: { open: true },
  wednesday: { open: true },
  thursday: { open: true },
  friday: { open: true },
  saturday: { open: false },
  sunday: { open: false },
};
export function getBusinessDays(config: any): BusinessDays {
  const stored = config?.company?.businessHours?.days;
  const days = {} as BusinessDays;
  for (const weekday of WEEKDAYS) {
    const entry = stored?.[weekday];
    if (!entry || typeof entry !== "object") {
      days[weekday] = { ...DEFAULT_BUSINESS_DAYS[weekday] };
      continue;
    }
    days[weekday] = {
      open: entry.open === true,
      ...(typeof entry.start === "string" ? { start: entry.start } : {}),
      ...(typeof entry.end === "string" ? { end: entry.end } : {}),
    };
  }
  return days;
}
export function getCompanyName(config: any): string {
  return (
    config?.company?.name ||
    (normalizeShopTrade(config?.company?.trade) === "hvac"
      ? "your HVAC company"
      : "your service company")
  );
}
export function toHhmm(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
  if (minute > 59) {
    return undefined;
  }
  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return undefined;
    }
    hour = meridiem.startsWith("p") ? (hour % 12) + 12 : hour % 12;
  } else if (hour > 23) {
    return undefined;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
