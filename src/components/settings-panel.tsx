"use client";
import {
  Building2,
  LayoutGrid,
  Search,
  ArrowUpRight,
  Cable,
  CalendarCheck,
  Wrench,
  BookOpen,
  AlertCircle,
  Phone,
  Clock,
  MapPin,
  Plus,
  X,
  Pencil,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  Play,
  Sparkles,
  Copy,
  ExternalLink,
  Bell,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { BookingMapSection } from "@/components/booking-map-section";
import BuddySettings from "@/components/buddy-settings";
import Button from "@/components/button";
import CrmConnectionSection from "@/components/crm-connection-section";
import OnboardingChecklist from "@/components/onboarding-checklist";
import { useShopClock } from "@/components/shop-clock";
import ShopNumbersSection from "@/components/shop-numbers-section";
import {
  bookingWindowLabel,
  windowClockMinutes,
  validateBookingWindows,
  type BookingWindow,
} from "@/lib/booking-windows";
import { features } from "@/lib/features";
import { formatPhone } from "@/lib/format";
import { MODEL_ACCESS_COPY, readModelAccess } from "@/lib/model-access";
import {
  type NotificationSettings,
  type PhoneSyncStatus,
  type SettingsResponse,
  type SettingsSaveResult,
  fetchPhoneSync,
  fetchSettings,
  resyncPhone,
  saveBookingWindows,
  saveKnowledgeChange,
  updateSettingsSection,
  type BookingNoticeHours,
  type BusinessDays,
  type CallHandlerSettings,
  type CompanyInfo,
  type EscalationSettings,
  type KnowledgeEntry,
  type Weekday,
} from "@/lib/settings-api";
import { useSettingsStore, type SettingsSection } from "@/lib/settings-store";
import { shopDate, shopDayKey, type ShopClock } from "@/lib/shop-time";
import { SHOP_TRADE_OPTIONS, shopTradeCopy, type ShopTrade } from "@/lib/shop-trades";
import { GoogleLsaSettings } from "./google-lsa-settings";
import { MetaSettings } from "./meta-settings";
type Tab = SettingsSection;
const ALL_TABS: {
  id: Tab;
  label: string;
  icon: typeof Building2;
}[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "company", label: "Company", icon: Building2 },
  { id: "integrations", label: "AI Model", icon: Sparkles },
  { id: "crm", label: "CRM Connection", icon: Cable },
  { id: "google-lsa", label: "Google LSA", icon: Cable },
  { id: "meta", label: "Meta Leads", icon: Cable },
  { id: "booking", label: "Booking", icon: CalendarCheck },
  { id: "services", label: "Pricebook", icon: Wrench },
  { id: "call-handler", label: "Phone", icon: Phone },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
];
const BASE_TABS = ALL_TABS.filter((tab) => tab.id !== "services" || features.settingsPricebook);
const STL_TABS = new Set<Tab>(["google-lsa", "meta"]);
const SECTION_DETAILS: Record<
  string,
  {
    group: string;
    description: string;
  }
> = {
  company: {
    group: "Your business",
    description: "Company details, business hours, service area, and fees.",
  },
  knowledge: {
    group: "Your business",
    description: "Teach Scout your policies, answers, and shop-specific knowledge.",
  },
  services: { group: "Your business", description: "Your services, labor rates, and taxes." },
  booking: {
    group: "How Scout works",
    description: "Scheduling, job types, and where appointments land.",
  },
  "call-handler": {
    group: "How Scout works",
    description: "How Scout answers your calls: voice, greeting, after hours, prices and texts.",
  },
  meta: { group: "Connections", description: "Connect your Facebook Page and lead form." },
  "google-lsa": { group: "Connections", description: "Connect your Google Local Services leads." },
  crm: {
    group: "Connections",
    description: "Connect the customer records and job history Scout works from.",
  },
  integrations: { group: "Connections", description: "Manage Scout’s AI account and connection." },
};
const PB_PAGE_SIZE = 10;
interface PbItem {
  id: string;
  name: string;
  kind: string;
  codes: string[];
  price?: number;
  categoryPath: string[];
}
type PbView = "items" | "labour" | "tax";
interface TaxRate {
  id: string;
  description: string;
  rate: number;
  isDefault?: boolean;
}
interface LaborRate {
  id: string;
  description: string;
  hourlyCost?: number;
  hourlyPrice: number;
  isDefault?: boolean;
}
const VOICE_REFRESH_RETRY_MS = 60000;
const VOICE_REFRESH_MAX_MS = 5 * 60000;
interface VoiceOption {
  id: string;
  name: string;
  description: string;
}
const TONE_OPTIONS: {
  id: CallHandlerSettings["tone"];
  label: string;
  hint: string;
}[] = [
  { id: "friendly", label: "Friendly", hint: "Warm, conversational" },
  { id: "professional", label: "Professional", hint: "Polished, neutral" },
  { id: "direct", label: "Direct", hint: "Brief, to the point" },
];
const MODEL_OPTIONS: {
  id: CallHandlerSettings["model"];
  label: string;
  hint: string;
}[] = [
  {
    id: "gpt-5.6-terra",
    label: "Advanced (recommended)",
    hint: "The model that passed our call-quality tests. Higher usage cost.",
  },
  {
    id: "gpt-4.1-mini",
    label: "Fast",
    hint: "Lower usage cost. Not recommended: only Advanced passed our call-quality tests.",
  },
];
const DEFAULT_CALL_HANDLER: CallHandlerSettings = {
  greeting: "Hi, {company}. How can I help?",
  voiceId: "dean",
  tone: "friendly",
  afterHoursEnabled: true,
  mentionSurcharge: false,
  model: "gpt-4.1-mini",
};
const WEEKDAY_ROWS: {
  key: Weekday;
  label: string;
  defaultOpen: boolean;
}[] = [
  { key: "monday", label: "Monday", defaultOpen: true },
  { key: "tuesday", label: "Tuesday", defaultOpen: true },
  { key: "wednesday", label: "Wednesday", defaultOpen: true },
  { key: "thursday", label: "Thursday", defaultOpen: true },
  { key: "friday", label: "Friday", defaultOpen: true },
  { key: "saturday", label: "Saturday", defaultOpen: false },
  { key: "sunday", label: "Sunday", defaultOpen: false },
];
const DEFAULT_BUSINESS_DAYS = Object.fromEntries(
  WEEKDAY_ROWS.map((row) => [row.key, { open: row.defaultOpen }]),
) as BusinessDays;
const BOOKING_NOTICE_ROWS: {
  value: BookingNoticeHours;
  label: string;
}[] = [
  { value: 0, label: "Same day" },
  { value: 24, label: "24 hours" },
  { value: 48, label: "48 hours" },
  { value: 72, label: "72 hours" },
];
function summarizeOpenDays(days: BusinessDays): string {
  const open = WEEKDAY_ROWS.filter((row) => days[row.key].open);
  if (open.length === 0) {
    return "Closed every day";
  }
  if (open.length === WEEKDAY_ROWS.length) {
    return "Open every day";
  }
  return `Open ${open.map((row) => row.label.slice(0, 3)).join(", ")}`;
}
function knowledgeSavedLabel(savedAt: string | undefined, clock: ShopClock): string {
  const day = shopDate(
    savedAt ? Date.parse(savedAt) : Number.NaN,
    clock,
    { month: "short", day: "numeric" },
    { autoYear: true },
  );
  return day ? `Saved ${day}` : "";
}
function summarizeClosedDates(closedDates: string[] | undefined, clock: ShopClock): string {
  const today = shopDayKey(Date.now(), clock);
  const upcoming = (closedDates ?? [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today)
    .toSorted();
  if (upcoming.length === 0) {
    return "";
  }
  const spoken = upcoming.map((d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  );
  return `Closed ${spoken.join(" · ")}`;
}
const DEFAULT_ESCALATION: EscalationSettings = {
  mode: "sms",
  transferNumber: "",
  transferMessage: "",
  ownerPhone: "",
  additionalPhones: [],
  afterHoursOwnerAlerts: true,
};
const PHONE_SYNC_POLL_MS = 5000;
const PHONE_SYNC_POLL_LIMIT_MS = 15 * 60000;
const PHONE_SYNC_SLOW_POLL_MS = 60000;
const PHONE_RETRYING_TOAST = "Saved. The phone line hasn't picked this up yet - retrying.";
const PHONE_SKIPPED_TOAST =
  "Saved. The phone update wasn't confirmed. Please check with support before relying on it.";
const PHONE_SYNC_BANNER: Record<
  Exclude<PhoneSyncStatus["state"], "applied" | "skipped">,
  string
> = {
  retrying: "Retrying: the phone line hasn't picked up your last save yet.",
  failed: "Saved, but the phone line still hasn't picked this up. Save again to retry.",
  unknown: "Saved, but Scout can't confirm the phone line picked this up. Save again to be sure.",
};
const PHONE_SYNC_REFUSAL_LINE = "An earlier change was turned down by the phone line:";
const CODEX_POLL_MS = 3000;
const CODEX_EXPIRY_GRACE_MS = 10000;
interface CodexPairing {
  verificationUrl: string;
  userCode: string;
  expiresAt: number;
  result:
    | {
        ok: true;
      }
    | {
        ok: false;
        error: string;
        failureCode?: string;
      }
    | null;
}
interface CodexAuthState {
  signedIn: boolean;
  accountLabel: string | null;
  gatewayUnreachable: boolean;
  apiKeyPresent: boolean;
  pairing: CodexPairing | null;
}
const CODEX_SIGNED_OUT: CodexAuthState = {
  signedIn: false,
  accountLabel: null,
  gatewayUnreachable: false,
  apiKeyPresent: false,
  pairing: null,
};
function readCodexPairing(raw: unknown): CodexPairing | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const userCode = typeof value.userCode === "string" ? value.userCode : "";
  const verificationUrl = typeof value.verificationUrl === "string" ? value.verificationUrl : "";
  if (!userCode || !verificationUrl) {
    return null;
  }
  const rawResult = value.result as Record<string, unknown> | null | undefined;
  let result: CodexPairing["result"] = null;
  if (rawResult && typeof rawResult === "object") {
    if (rawResult.ok === true) {
      result = { ok: true };
    } else {
      const error =
        typeof rawResult.error === "string" && rawResult.error.trim()
          ? rawResult.error.trim()
          : "The sign-in service would not accept the code.";
      result =
        typeof rawResult.failureCode === "string"
          ? { ok: false, error, failureCode: rawResult.failureCode }
          : { ok: false, error };
    }
  }
  return {
    verificationUrl,
    userCode,
    expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : 0,
    result,
  };
}
async function fetchCodexStatus(): Promise<CodexAuthState> {
  try {
    const res = await fetch("/api/auth/openai-codex/status", { cache: "no-store" });
    const data = (await res.json()) as Record<string, unknown>;
    const signedIn = data.signedIn === true;
    return {
      signedIn,
      accountLabel:
        typeof data.accountLabel === "string" && data.accountLabel.trim()
          ? data.accountLabel.trim()
          : null,
      gatewayUnreachable: data.gatewayUnreachable === true,
      apiKeyPresent: data.apiKeyPresent === true,
      pairing: signedIn ? null : readCodexPairing(data.pairing),
    };
  } catch {
    return { ...CODEX_SIGNED_OUT, gatewayUnreachable: true };
  }
}
function formatCodexRemaining(ms: number): string {
  if (ms >= 60000) {
    const minutes = Math.ceil(ms / 60000);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
function dialedDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}
function sameDialedNumber(a: string, b: string): boolean {
  return dialedDigits(a) === dialedDigits(b);
}
interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}
const GREETING_MAX = 160;
function fillGreeting(greeting: string, companyName: string): string {
  return greeting.replace(/\{\s*company\s*\}/gi, companyName);
}
function clockLabel(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return value.trim();
  }
  const hours = Number(match[1]);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours >= 12 ? "PM" : "AM";
  return match[2] === "00" ? `${hour12} ${suffix}` : `${hour12}:${match[2]} ${suffix}`;
}
function hoursSummary(company: CompanyInfo): string {
  const { start, end, days } = company.hours;
  if (!start || !end) {
    return "not set yet";
  }
  return `${clockLabel(start)}-${clockLabel(end)}${days ? `, ${summarizeOpenDays(days)}` : ""}`;
}
const WINDOW_TIMES = Array.from({ length: 48 }, (_, i) =>
  [Math.floor(i / 2), (i % 2) * 30].map((n) => String(n).padStart(2, "0")).join(":"),
);
const WINDOW_PRESETS: Array<{
  label: string;
  windows: BookingWindow[];
}> = [
  {
    label: "8-10, 10-12, 12-2, 2-4",
    windows: [
      { start: "08:00", end: "10:00" },
      { start: "10:00", end: "12:00" },
      { start: "12:00", end: "14:00" },
      { start: "14:00", end: "16:00" },
    ],
  },
  {
    label: "8-12, 12-4",
    windows: [
      { start: "08:00", end: "12:00" },
      { start: "12:00", end: "16:00" },
    ],
  },
];
function nextBookingWindow(windows: BookingWindow[]): BookingWindow {
  const lastEnd = windowClockMinutes(windows[windows.length - 1]?.end) ?? 8 * 60;
  const start = Math.min(lastEnd, 22 * 60 + 30);
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { start: clock(start), end: clock(start + 60) };
}
function PhoneGroup({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
function PhoneSwitch({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-terracotta" : "bg-tan"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}
function SwitchRow({
  title,
  detail,
  on,
  onToggle,
}: {
  title: string;
  detail: ReactNode;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-paper-2 px-4 py-3.5">
      <div>
        <p className="text-body font-medium text-ink">{title}</p>
        <p className="text-label text-ink-3">{detail}</p>
      </div>
      <PhoneSwitch label={title} on={on} onToggle={onToggle} />
    </div>
  );
}
function DollarInput({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-32 shrink-0">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-3">
        $
      </span>
      <input
        id={id}
        type="number"
        min="0"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field w-full py-2 pl-7"
      />
    </div>
  );
}
function changedFields<T extends object>(
  saved: T,
  form: T,
  skip: Array<keyof T> = [],
): Partial<T> | null {
  const changed: Partial<T> = {};
  for (const key of Object.keys(form) as Array<keyof T>) {
    if (!skip.includes(key) && JSON.stringify(form[key]) !== JSON.stringify(saved[key])) {
      changed[key] = form[key];
    }
  }
  return Object.keys(changed).length > 0 ? changed : null;
}
function rebaseForm<T extends object>(form: T, oldSaved: T, newSaved: T, sent: object = {}): T {
  const next = { ...form };
  for (const key of Object.keys(newSaved) as Array<keyof T>) {
    if (key in sent || JSON.stringify(form[key]) === JSON.stringify(oldSaved[key])) {
      next[key] = newSaved[key];
    }
  }
  return next;
}
function feesFormFrom(fees: Partial<SettingsResponse["fees"]> | undefined): FeesForm {
  return {
    diagnosticFee: fees?.diagnosticFee ? String(fees.diagnosticFee) : "",
    emergencySurcharge: fees?.emergencySurcharge ? String(fees.emergencySurcharge) : "",
    paymentUrl: fees?.paymentUrl ?? "",
    minBookingNoticeHours: fees?.minBookingNoticeHours ?? 0,
  };
}
function companyFormFrom(company: CompanyInfo): CompanyInfo {
  return {
    ...company,
    emergencyExamples: company.emergencyExamples ?? "",
    trade: company.trade ?? "hvac",
    serviceArea: { ...company.serviceArea, locations: [...company.serviceArea.locations] },
  };
}
function companyChanges(saved: CompanyInfo, form: CompanyInfo): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  for (const key of ["name", "phone", "trade"] as const) {
    if (form[key] !== saved[key]) {
      payload[key] = form[key];
    }
  }
  const area: Record<string, unknown> = {};
  for (const key of ["mode", "radiusMiles", "centerAddress", "notes"] as const) {
    if (form.serviceArea[key] !== saved.serviceArea[key]) {
      area[key] = form.serviceArea[key];
    }
  }
  if (JSON.stringify(form.serviceArea.locations) !== JSON.stringify(saved.serviceArea.locations)) {
    area.locations = form.serviceArea.locations;
  }
  if (Object.keys(area).length > 0) {
    payload.serviceArea = area;
  }
  const hours: Record<string, unknown> = {};
  for (const key of ["start", "end", "timezone"] as const) {
    if (form.hours[key] !== saved.hours[key]) {
      hours[key] = form.hours[key];
    }
  }
  const closedDates = form.hours.closedDates ?? [];
  if (JSON.stringify(closedDates) !== JSON.stringify(saved.hours.closedDates ?? [])) {
    hours.closedDates = closedDates;
  }
  const days: Record<string, Record<string, unknown>> = {};
  for (const { key } of WEEKDAY_ROWS) {
    const now = form.hours.days?.[key];
    const was = saved.hours.days?.[key];
    const day: Record<string, unknown> = {};
    if (now?.open !== was?.open) {
      day.open = now?.open;
    }
    for (const field of ["start", "end"] as const) {
      if ((now?.[field] ?? "") !== (was?.[field] ?? "")) {
        day[field] = now?.[field] ?? "";
      }
    }
    if (Object.keys(day).length > 0) {
      days[key] = day;
    }
  }
  if (Object.keys(days).length > 0) {
    hours.days = days;
    hours.dayFields = true;
  }
  if (Object.keys(hours).length > 0) {
    payload.hours = hours;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}
const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  twoWaySchedulingTexts: false,
  textOnBooking: false,
  textAfterCall: false,
  textCustomerOnBooking: true,
  textTechOnBooking: true,
};
type DebtSource = "knowledge" | "other";
interface FeesForm {
  diagnosticFee: string;
  emergencySurcharge: string;
  paymentUrl: string;
  minBookingNoticeHours: BookingNoticeHours;
}
const EMPTY_FEES: FeesForm = {
  diagnosticFee: "",
  emergencySurcharge: "",
  paymentUrl: "",
  minBookingNoticeHours: 0,
};
interface EmergencyRules {
  emergencyAfterHours: boolean;
  emergencyExamples: string;
}
const DEFAULT_EMERGENCY_RULES: EmergencyRules = {
  emergencyAfterHours: true,
  emergencyExamples: "",
};
function readEmergencyRules(company: Partial<CompanyInfo> | null | undefined): EmergencyRules {
  return {
    emergencyAfterHours: company?.hours?.emergencyAfterHours !== false,
    emergencyExamples: company?.emergencyExamples ?? "",
  };
}
function emergencyPayload(saved: EmergencyRules, form: EmergencyRules) {
  const payload: {
    hours?: {
      emergencyAfterHours: boolean;
    };
    emergencyExamples?: string;
  } = {};
  if (form.emergencyAfterHours !== saved.emergencyAfterHours) {
    payload.hours = { emergencyAfterHours: form.emergencyAfterHours };
  }
  if (form.emergencyExamples !== saved.emergencyExamples) {
    payload.emergencyExamples = form.emergencyExamples;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed inset-x-4 bottom-[calc(1rem+var(--safe-b))] z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-body font-medium shadow-card transition-all ${t.type === "success" ? "bg-sage-deep text-on-accent" : "bg-alarm text-on-accent"}`}
        >
          {t.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) {
    return null;
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm animate-backdropFade"
    >
      <div className="w-full max-w-lg rounded-[28px] bg-paper shadow-lift animate-modalEnter">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h3 className="font-display text-h2 font-medium text-ink">{title}</h3>
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="chrome-button flex items-center justify-center text-ink-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
export default function SettingsPanel({ speedToLead = false }: { speedToLead?: boolean }) {
  const tabs = speedToLead ? BASE_TABS : BASE_TABS.filter((tab) => !STL_TABS.has(tab.id));
  const clock = useShopClock();
  const [sectionSearch, setSectionSearch] = useState("");
  const activeTab = useSettingsStore((s) => s.section);
  const setActiveTab = useSettingsStore((s) => s.setSection);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const applyScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const fade = Math.min(el.scrollTop, 112);
    const mask = fade > 0 ? `linear-gradient(to bottom, transparent 0, #000 ${fade}px)` : "none";
    el.style.maskImage = mask;
    el.style.webkitMaskImage = mask;
  }, []);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    applyScrollFade();
    tabStripRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTab, applyScrollFade]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyBaseline, setCompanyBaseline] = useState<CompanyInfo | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyInfo>({
    name: "",
    phone: "",
    serviceArea: {
      mode: "list",
      radiusMiles: 30,
      centerAddress: "",
      locations: [],
      notes: "",
      summary: "No ZIP codes or cities set",
    },
    businessHours: "",
    hours: {
      start: "",
      end: "",
      timezone: "",
      emergencyAfterHours: true,
      days: DEFAULT_BUSINESS_DAYS,
      closedDates: [],
    },
    emergencyExamples: "",
    trade: "hvac",
  });
  const [callHandlerForm, setCallHandlerForm] = useState<CallHandlerSettings>(DEFAULT_CALL_HANDLER);
  const [shownVoice, setShownVoice] = useState({
    voiceId: DEFAULT_CALL_HANDLER.voiceId,
    custom: false,
  });
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [feesForm, setFeesForm] = useState<FeesForm>(EMPTY_FEES);
  const [savedFees, setSavedFees] = useState<FeesForm>(EMPTY_FEES);
  const [notificationsForm, setNotificationsForm] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [savedNotifications, setSavedNotifications] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [bookingWindowsForm, setBookingWindowsForm] = useState<BookingWindow[]>([]);
  const [savedBookingWindows, setSavedBookingWindows] = useState<BookingWindow[]>([]);
  const customVoiceActive = Boolean(callHandlerForm.customVoice);
  const [savedCallHandler, setSavedCallHandler] =
    useState<CallHandlerSettings>(DEFAULT_CALL_HANDLER);
  const [pushOwed, setPushOwed] = useState(false);
  const owedSources = useRef(new Set<DebtSource>());
  const owe = useCallback((change: (owed: Set<DebtSource>) => void) => {
    change(owedSources.current);
    setPushOwed(owedSources.current.size > 0);
  }, []);
  const [pushingSave, setPushingSave] = useState(false);
  const pollCovers = useRef(new Map<string, Set<DebtSource> | "all">());
  const debtAtBegin = useRef(new Set<DebtSource>());
  const activeSaves = useRef(0);
  const pollEpoch = useRef(0);
  const voiceRefreshOwed = useRef(false);
  const voiceReadSeq = useRef(0);
  const settledSyncIds = useRef(new Set<string>());
  const pollDeadline = useRef<{
    id: string;
    startedAt: number;
  } | null>(null);
  const [savingCallHandler, setSavingCallHandler] = useState(false);
  const [closedDateDraft, setClosedDateDraft] = useState("");
  const [escalationForm, setEscalationForm] = useState<EscalationSettings>(DEFAULT_ESCALATION);
  const [savedEscalation, setSavedEscalation] = useState<EscalationSettings>(DEFAULT_ESCALATION);
  const [escalationLoaded, setEscalationLoaded] = useState(false);
  const [alertPhone, setAlertPhone] = useState("");
  const [savingAlertPhone, setSavingAlertPhone] = useState(false);
  const [phoneSync, setPhoneSync] = useState<PhoneSyncStatus | null>(null);
  const [emergencyForm, setEmergencyForm] = useState<EmergencyRules>(DEFAULT_EMERGENCY_RULES);
  const [savedEmergency, setSavedEmergency] = useState<EmergencyRules>(DEFAULT_EMERGENCY_RULES);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const greetingRef = useRef<HTMLTextAreaElement>(null);
  const [additionalPhonesDraft, setAdditionalPhonesDraft] = useState("");
  const [codexAuth, setCodexAuth] = useState<CodexAuthState>(CODEX_SIGNED_OUT);
  const [codexPairingOpen, setCodexPairingOpen] = useState(false);
  const [startingCodexSignIn, setStartingCodexSignIn] = useState(false);
  const [signingOutCodex, setSigningOutCodex] = useState(false);
  const [codexCodeCopied, setCodexCodeCopied] = useState(false);
  const [codexNow, setCodexNow] = useState(() => Date.now());
  const codexAuthRef = useRef<CodexAuthState>(CODEX_SIGNED_OUT);
  const codexPairingSeed = useRef(0);
  const applyCodexAuth = useCallback((next: CodexAuthState) => {
    codexAuthRef.current = next;
    setCodexAuth(next);
  }, []);
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeEntry | null>(null);
  const [knowledgeForm, setKnowledgeForm] = useState({ topic: "", content: "", source: "" });
  const [saving, setSaving] = useState(false);
  const [pbItems, setPbItems] = useState<PbItem[]>([]);
  const [pbTotal, setPbTotal] = useState(0);
  const [pbCount, setPbCount] = useState<number | null>(null);
  const [pbPage, setPbPage] = useState(0);
  const [pbQuery, setPbQuery] = useState("");
  const [pbLoading, setPbLoading] = useState(false);
  const [pbView, setPbView] = useState<PbView>("items");
  const [taxRates, setTaxRates] = useState<TaxRate[] | null>(null);
  const [laborRates, setLaborRates] = useState<LaborRate[] | null>(null);
  const loadPricebook = useCallback(async (page: number, query: string) => {
    setPbLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PB_PAGE_SIZE),
        offset: String(page * PB_PAGE_SIZE),
      });
      if (query.trim()) {
        params.set("q", query.trim());
      }
      const res = await fetch(`/api/crm/pricebook/items?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setPbItems([]);
        setPbTotal(0);
        setPbCount(null);
        return;
      }
      const data = (await res.json()) as {
        count?: number;
        total?: number;
        items?: PbItem[];
      };
      setPbItems(data.items ?? []);
      setPbTotal(data.total ?? 0);
      setPbCount(data.count ?? 0);
    } catch {
      setPbItems([]);
      setPbTotal(0);
      setPbCount(null);
    } finally {
      setPbLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!features.settingsPricebook || activeTab !== "services") {
      return undefined;
    }
    const t = setTimeout(() => void loadPricebook(pbPage, pbQuery), 250);
    return () => clearTimeout(t);
  }, [activeTab, pbPage, pbQuery, loadPricebook]);
  useEffect(() => {
    if (!features.settingsPricebook || activeTab !== "services") {
      return;
    }
    void (async () => {
      try {
        const [tax, labor] = await Promise.all([
          fetch("/api/crm/pricebook/tax-rates", { cache: "no-store" }),
          fetch("/api/crm/pricebook/labor-rates", { cache: "no-store" }),
        ]);
        const taxData = tax.ok
          ? ((await tax.json()) as {
              rates?: TaxRate[];
            })
          : { rates: [] };
        const laborData = labor.ok
          ? ((await labor.json()) as {
              rates?: LaborRate[];
            })
          : { rates: [] };
        setTaxRates(taxData.rates ?? []);
        setLaborRates(laborData.rates ?? []);
      } catch {
        setTaxRates([]);
        setLaborRates([]);
      }
    })();
  }, [activeTab]);
  useEffect(() => {
    fetchSettings()
      .then((settings) => {
        setCompany(settings.company);
        setKnowledge(settings.knowledge);
        const options = settings.voiceOptions ?? [];
        const storedVoice = settings.callHandler.voiceId;
        const voiceKnown =
          options.length === 0 ||
          Boolean(settings.callHandler.customVoice) ||
          options.some((option) => option.id === storedVoice);
        const callHandler = voiceKnown
          ? settings.callHandler
          : { ...settings.callHandler, voiceId: DEFAULT_CALL_HANDLER.voiceId };
        setCallHandlerForm(callHandler);
        setShownVoice({ voiceId: callHandler.voiceId, custom: Boolean(callHandler.customVoice) });
        if (settings.callHandler.voiceMatchUnavailable) {
          voiceRefreshOwed.current = true;
        }
        setSavedCallHandler(callHandler);
        setVoiceOptions(options);
        const fees = feesFormFrom(settings.fees);
        setFeesForm(fees);
        setSavedFees(fees);
        const notifications = settings.notifications ?? DEFAULT_NOTIFICATIONS;
        setNotificationsForm(notifications);
        setSavedNotifications(notifications);
        const bookingWindows = settings.bookingWindows ?? [];
        setBookingWindowsForm(bookingWindows);
        setSavedBookingWindows(bookingWindows);
        const emergency = readEmergencyRules(settings.company);
        setEmergencyForm(emergency);
        setSavedEmergency(emergency);
        setEscalationForm(settings.escalation);
        setSavedEscalation(settings.escalation);
        setEscalationLoaded(true);
        setAlertPhone(formatPhone(settings.escalation.ownerPhone));
        setAdditionalPhonesDraft((settings.escalation.additionalPhones ?? []).join(", "));
        if (settings.phoneSync) {
          adoptPhoneSync(settings.phoneSync);
        }
      })
      .catch(() => {});
  }, []);
  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const phoneSyncId = phoneSync?.id;
  const phoneSyncState = phoneSync?.state;
  const phoneSyncWatched = phoneSyncState === "retrying" || phoneSyncState === "failed";
  useEffect(() => {
    if (!phoneSyncId || !phoneSyncWatched) {
      return undefined;
    }
    const retrying = phoneSyncState === "retrying";
    let cancelled = false;
    if (retrying && pollDeadline.current?.id !== phoneSyncId) {
      pollDeadline.current = { id: phoneSyncId, startedAt: Date.now() };
    }
    const startedAt = pollDeadline.current?.startedAt ?? Date.now();
    const check = () => {
      if (activeSaves.current > 0) {
        return;
      }
      if (retrying && Date.now() - startedAt > PHONE_SYNC_POLL_LIMIT_MS) {
        setPhoneSync({ id: phoneSyncId, state: "unknown" });
        return;
      }
      const epoch = pollEpoch.current;
      void fetchPhoneSync(phoneSyncId)
        .then((next) => {
          const stale = activeSaves.current > 0 || epoch !== pollEpoch.current;
          if (cancelled || stale || (next.state === phoneSyncState && !next.superseded)) {
            return;
          }
          const delivered = next.state === "applied" || next.superseded === true;
          if (delivered || next.state === "skipped") {
            settledSyncIds.current.add(phoneSyncId);
          }
          if (delivered) {
            setPhoneSync(null);
            const covers = pollCovers.current.get(phoneSyncId);
            pollCovers.current.delete(phoneSyncId);
            owe((owed) => {
              if (covers === "all") {
                owed.clear();
              } else {
                covers?.forEach((source) => owed.delete(source));
              }
            });
            addToast(
              "success",
              next.superseded
                ? "The phone line now has your current settings."
                : "The phone line picked up your changes.",
            );
            voiceRefreshOwed.current = true;
            refreshVoiceIfOwed();
          } else if (next.state === "skipped") {
            setPhoneSync(null);
            owe((owed) => owed.clear());
            addToast("error", PHONE_SKIPPED_TOAST);
          } else {
            if (next.state === "retrying") {
              pollDeadline.current = { id: phoneSyncId, startedAt: Date.now() };
            }
            setPhoneSync(next);
          }
        })
        .catch(() => {});
    };
    const timer = setInterval(check, retrying ? PHONE_SYNC_POLL_MS : PHONE_SYNC_SLOW_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phoneSyncId, phoneSyncState, phoneSyncWatched, addToast, owe]);
  useEffect(() => {
    let delay = VOICE_REFRESH_RETRY_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };
    function tick() {
      if (!voiceRefreshOwed.current) {
        delay = VOICE_REFRESH_RETRY_MS;
      } else if (document.visibilityState === "visible") {
        refreshVoiceIfOwed();
        delay = Math.min(delay * 2, VOICE_REFRESH_MAX_MS);
      }
      schedule();
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && voiceRefreshOwed.current) {
        delay = VOICE_REFRESH_RETRY_MS;
        refreshVoiceIfOwed();
        schedule();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetchCodexStatus().then((next) => {
      if (cancelled || codexPairingSeed.current !== 0) {
        return;
      }
      applyCodexAuth(next);
    });
    return () => {
      cancelled = true;
    };
  }, [applyCodexAuth]);
  const codexExpiresAt = codexAuth.pairing?.expiresAt ?? 0;
  const codexMsRemaining = codexExpiresAt ? Math.max(0, codexExpiresAt - codexNow) : 0;
  const codexResult = codexAuth.pairing?.result ?? null;
  const codexFailed = codexResult?.ok === false;
  const codexExpired =
    Boolean(codexAuth.pairing) && !codexFailed && codexExpiresAt > 0 && codexMsRemaining === 0;
  const codexPastGrace = codexExpiresAt > 0 && codexNow > codexExpiresAt + CODEX_EXPIRY_GRACE_MS;
  const codexPairingActive = Boolean(codexAuth.pairing) && !codexFailed && !codexExpired;
  const modelAccess = readModelAccess(codexAuth);
  useEffect(() => {
    if (!codexExpiresAt) {
      return undefined;
    }
    setCodexNow(Date.now());
    const timer = setInterval(() => {
      const now = Date.now();
      setCodexNow(now);
      if (now > codexExpiresAt + CODEX_EXPIRY_GRACE_MS) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [codexExpiresAt]);
  const codexPollLive =
    !codexAuth.signedIn &&
    codexAuth.pairing !== null &&
    !codexAuth.pairing.result &&
    !codexPastGrace;
  const codexPollKey = codexPollLive ? codexAuth.pairing?.userCode : null;
  useEffect(() => {
    if (!codexPollKey) {
      return undefined;
    }
    let cancelled = false;
    async function check(): Promise<void> {
      const seed = codexPairingSeed.current;
      const next = await fetchCodexStatus();
      if (cancelled || codexPairingSeed.current !== seed) {
        return;
      }
      const prev = codexAuthRef.current;
      const merged: CodexAuthState = {
        ...next,
        pairing: next.signedIn ? null : (next.pairing ?? prev.pairing),
      };
      applyCodexAuth(merged);
      if (merged.signedIn && !prev.signedIn) {
        setCodexPairingOpen(false);
        setStartingCodexSignIn(false);
        setCodexCodeCopied(false);
        addToast("success", "ScoutAI — connected");
      } else if (merged.pairing?.result?.ok === false && prev.pairing?.result?.ok !== false) {
        setStartingCodexSignIn(false);
        addToast("error", `Sign-in failed: ${merged.pairing.result.error}`);
      }
    }
    void check();
    const timer = setInterval(() => void check(), CODEX_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [codexPollKey, addToast, applyCodexAuth]);
  const startCodexSignIn = useCallback(async () => {
    setStartingCodexSignIn(true);
    setCodexCodeCopied(false);
    try {
      const res = await fetch("/api/auth/openai-codex/start", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        addToast(
          "error",
          typeof data.error === "string" ? data.error : "Could not start sign-in. Try again.",
        );
        return;
      }
      const verificationUrl = typeof data.verificationUrl === "string" ? data.verificationUrl : "";
      const userCode = typeof data.userCode === "string" ? data.userCode : "";
      if (!verificationUrl || !userCode) {
        addToast("error", "That sign-in didn't finish. Try again.");
        return;
      }
      if (codexAuthRef.current.signedIn) {
        return;
      }
      codexPairingSeed.current += 1;
      applyCodexAuth({
        ...codexAuthRef.current,
        gatewayUnreachable: false,
        pairing: {
          verificationUrl,
          userCode,
          expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : Date.now() + 15 * 60000,
          result: null,
        },
      });
      setCodexNow(Date.now());
      setCodexPairingOpen(true);
    } catch (err) {
      addToast("error", `Could not start sign-in: ${(err as Error).message}`);
    } finally {
      setStartingCodexSignIn(false);
    }
  }, [addToast, applyCodexAuth]);
  const signOutCodex = useCallback(async () => {
    setSigningOutCodex(true);
    try {
      const res = await fetch("/api/auth/openai-codex/logout", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.ok === false) {
        addToast(
          "error",
          typeof data.error === "string" ? data.error : "Could not sign out. Try again.",
        );
        return;
      }
      applyCodexAuth({
        ...CODEX_SIGNED_OUT,
        apiKeyPresent: codexAuthRef.current.apiKeyPresent,
      });
      setCodexPairingOpen(false);
      addToast("success", "ScoutAI disconnected");
    } catch (err) {
      addToast("error", `Could not sign out: ${(err as Error).message}`);
    } finally {
      setSigningOutCodex(false);
    }
  }, [addToast, applyCodexAuth]);
  const cancelCodexPairing = useCallback(async () => {
    setCodexPairingOpen(false);
    setCodexCodeCopied(false);
    codexPairingSeed.current += 1;
    applyCodexAuth({ ...codexAuthRef.current, pairing: null });
    try {
      await fetch("/api/auth/openai-codex/logout", { method: "POST" });
    } catch {}
  }, [applyCodexAuth]);
  const restartCodexSignIn = useCallback(async () => {
    codexPairingSeed.current += 1;
    applyCodexAuth({ ...codexAuthRef.current, pairing: null });
    setCodexPairingOpen(false);
    await startCodexSignIn();
  }, [applyCodexAuth, startCodexSignIn]);
  const copyCodexCode = useCallback(async () => {
    const code = codexAuth.pairing?.userCode;
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCodexCodeCopied(true);
      setTimeout(() => setCodexCodeCopied(false), 2000);
    } catch {
      addToast("error", "Could not copy the code. Read it off the screen instead.");
    }
  }, [codexAuth.pairing?.userCode, addToast]);
  function startEditCompany() {
    if (!company) {
      return;
    }
    const form = companyFormFrom(company);
    setCompanyForm(form);
    setCompanyBaseline(companyFormFrom(company));
    setEditingCompany(true);
  }
  function setBusinessDay(day: Weekday, patch: Partial<BusinessDays[Weekday]>) {
    setCompanyForm((current) => {
      const next = { ...current.hours.days[day], ...patch };
      for (const field of ["start", "end"] as const) {
        if (next[field] !== undefined && next[field].trim() === "") {
          delete next[field];
        }
      }
      return {
        ...current,
        hours: { ...current.hours, days: { ...current.hours.days, [day]: next } },
      };
    });
  }
  function feesPayload() {
    const dollars = (value: string) => (value.trim() === "" ? 0 : Number(value));
    const payload: {
      diagnosticFee?: number;
      emergencySurcharge?: number;
      paymentUrl?: string;
      minBookingNoticeHours?: BookingNoticeHours;
    } = {};
    if (feesForm.diagnosticFee.trim() !== savedFees.diagnosticFee.trim()) {
      payload.diagnosticFee = dollars(feesForm.diagnosticFee);
    }
    if (feesForm.emergencySurcharge.trim() !== savedFees.emergencySurcharge.trim()) {
      payload.emergencySurcharge = dollars(feesForm.emergencySurcharge);
    }
    if (feesForm.paymentUrl.trim() !== savedFees.paymentUrl.trim()) {
      payload.paymentUrl = feesForm.paymentUrl.trim();
    }
    if (feesForm.minBookingNoticeHours !== savedFees.minBookingNoticeHours) {
      payload.minBookingNoticeHours = feesForm.minBookingNoticeHours;
    }
    return Object.keys(payload).length > 0 ? payload : null;
  }
  function pushFailed(result: SettingsSaveResult | null): boolean {
    return typeof result?.callHandlerPush === "object";
  }
  function beginPushingSave() {
    debtAtBegin.current = new Set(owedSources.current);
    activeSaves.current += 1;
    pollEpoch.current += 1;
    setPushingSave(true);
  }
  function endPushingSave(
    source: DebtSource,
    results: SettingsSaveResult[],
    resync: SettingsSaveResult | null,
  ) {
    if (resync) {
      if (!pushFailed(resync)) {
        pollCovers.current.forEach((_covers, id) => settledSyncIds.current.add(id));
      }
      owe((owed) => (pushFailed(resync) ? owed.add("other") : owed.clear()));
    } else if (results.some((result) => pushFailed(result))) {
      owe((owed) => owed.add(source));
    } else if (source === "knowledge" && results.length > 0) {
      owe((owed) => owed.delete("knowledge"));
    }
    const sync = results.findLast((result) => result.phoneSync)?.phoneSync;
    if (sync?.state === "retrying") {
      const prior = debtAtBegin.current;
      const uncarried = results.some(
        (result) => pushFailed(result) && result.phoneSync?.id !== sync.id,
      );
      pollCovers.current.set(
        sync.id,
        resync
          ? "all"
          : source === "knowledge"
            ? new Set<DebtSource>(["knowledge"])
            : new Set<DebtSource>(prior.has("other") || uncarried ? [] : ["other"]),
      );
    }
    activeSaves.current -= 1;
    pollEpoch.current += 1;
    if (activeSaves.current === 0) {
      setPushingSave(false);
    }
    if (phoneSync) {
      voiceRefreshOwed.current = true;
    }
    refreshVoiceIfOwed();
  }
  async function saveFees(fees: object, results: SettingsSaveResult[]) {
    const result = await updateSettingsSection("fees", fees);
    const saved = result.settings?.fees ? feesFormFrom(result.settings.fees) : feesForm;
    setFeesForm((form) => rebaseForm(form, savedFees, saved, fees));
    setSavedFees(saved);
    results.push(result);
  }
  function reportSettingsSave(results: SettingsSaveResult[], successMessage: string) {
    const pushes = results.map((result) => result.callHandlerPush);
    const sync = results.findLast((result) => result.phoneSync)?.phoneSync;
    const refused = results.some(
      (result) =>
        typeof result.callHandlerPush === "object" && result.phoneSync?.state !== "retrying",
    );
    if (sync) {
      setPhoneSync(sync.state === "retrying" ? sync : null);
    }
    if (refused) {
      addToast(
        "error",
        "Saved, but the phone hasn't received every change. Please save again to retry.",
      );
    } else if (pushes.some((push) => typeof push === "object") && sync?.state === "retrying") {
      addToast("error", PHONE_RETRYING_TOAST);
    } else if (pushes.includes("skipped") || sync?.state === "skipped") {
      addToast("error", PHONE_SKIPPED_TOAST);
    } else {
      addToast("success", successMessage);
    }
  }
  async function saveCompany() {
    if (activeSaves.current > 0) {
      return;
    }
    if (
      companyForm.serviceArea.mode === "list" &&
      companyForm.serviceArea.locations.every((entry) => !entry.trim())
    ) {
      addToast("error", "Add at least one ZIP code or city");
      return;
    }
    if (
      companyForm.serviceArea.mode === "radius" &&
      !companyForm.serviceArea.centerAddress.trim()
    ) {
      addToast("error", "Add the company location used to measure the radius");
      return;
    }
    const changes = companyBaseline ? companyChanges(companyBaseline, companyForm) : null;
    if (changes && "name" in changes && !String(changes.name).trim()) {
      addToast("error", "Add your company name");
      return;
    }
    if (changes && "phone" in changes && !String(changes.phone).trim()) {
      addToast("error", "Enter the number customers call - the company phone can't be blank");
      return;
    }
    const changedHours = (changes?.hours ?? {}) as Record<string, unknown>;
    if (["start", "end"].some((key) => key in changedHours && !String(changedHours[key]).trim())) {
      addToast("error", "Business hours need both a start and an end time");
      return;
    }
    if ("timezone" in changedHours && !String(changedHours.timezone).trim()) {
      addToast("error", "Pick a timezone for your business hours");
      return;
    }
    const fees = feesPayload();
    const owedBefore = pushOwed;
    if (!changes && !fees && !owedBefore) {
      setEditingCompany(false);
      return;
    }
    setSaving(true);
    const results: SettingsSaveResult[] = [];
    let resync: SettingsSaveResult | null = null;
    beginPushingSave();
    try {
      if (changes) {
        const result = await updateSettingsSection("company", changes);
        const saved = result.settings?.company;
        setCompany(saved ?? { ...companyForm });
        const savedForm = saved ? companyFormFrom(saved) : companyForm;
        setCompanyBaseline(savedForm);
        setCompanyForm(savedForm);
        results.push(result);
      }
      if (fees) {
        await saveFees(fees, results);
      }
      if (owedBefore) {
        voiceRefreshOwed.current = true;
        resync = await resyncPhone();
        results.push(resync);
      }
      setEditingCompany(results.some((saved) => typeof saved.callHandlerPush === "object"));
      reportSettingsSave(results, "Company info updated");
    } catch (err) {
      const reason = err instanceof Error ? err.message.trim() : "";
      addToast("error", reason || "Failed to save company info");
    } finally {
      setSaving(false);
      endPushingSave("other", results, resync);
    }
  }
  function updateCallHandlerField<K extends keyof CallHandlerSettings>(
    key: K,
    value: CallHandlerSettings[K],
  ) {
    setCallHandlerForm((prev) => ({ ...prev, [key]: value }));
  }
  function refreshVoiceIfOwed() {
    if (voiceRefreshOwed.current && activeSaves.current === 0) {
      refreshVoicePresentation();
    }
  }
  function refreshVoicePresentation() {
    const epoch = pollEpoch.current;
    voiceReadSeq.current += 1;
    const seq = voiceReadSeq.current;
    void fetchSettings()
      .then((settings) => {
        if (seq !== voiceReadSeq.current) {
          return;
        }
        if (activeSaves.current > 0 || epoch !== pollEpoch.current) {
          voiceRefreshOwed.current = true;
          return;
        }
        const outstanding = adoptPhoneSync(settings.phoneSync);
        const fresh = settings.callHandler;
        if (fresh.voiceMatchUnavailable || (settings.voiceOptions ?? []).length === 0) {
          return;
        }
        const voice = {
          voiceId: fresh.voiceId,
          customVoice: fresh.customVoice,
          tunedVoice: fresh.tunedVoice,
          voiceMatchUnavailable: undefined,
        };
        setVoiceOptions(settings.voiceOptions);
        setCallHandlerForm((prev) =>
          prev.voicePicked
            ? {
                ...prev,
                voicePicked: prev.voiceId !== fresh.voiceId || Boolean(fresh.customVoice),
              }
            : { ...prev, ...voice },
        );
        setSavedCallHandler((prev) => ({ ...prev, ...voice }));
        setShownVoice({ voiceId: fresh.voiceId, custom: Boolean(fresh.customVoice) });
        voiceRefreshOwed.current = outstanding;
      })
      .catch(() => {});
  }
  function adoptPhoneSync(sync: PhoneSyncStatus | undefined): boolean {
    if (
      !sync ||
      settledSyncIds.current.has(sync.id) ||
      sync.state === "applied" ||
      sync.state === "skipped"
    ) {
      return false;
    }
    const retrying = sync.state === "retrying";
    if (pollCovers.current.has(sync.id)) {
      if (sync.state === "failed") {
        setPhoneSync((shown) =>
          shown?.state === "retrying" && shown.id !== sync.id ? shown : sync,
        );
        if (owedSources.current.size === 0) {
          owe((owed) => owed.add("other"));
        }
      }
      return retrying;
    }
    setPhoneSync(sync);
    if (owedSources.current.size === 0) {
      owe((owed) => owed.add("other"));
      pollCovers.current.set(sync.id, "all");
    } else {
      pollCovers.current.set(sync.id, new Set<DebtSource>());
    }
    return retrying;
  }
  function pickVoice(voiceId: string) {
    setCallHandlerForm((prev) => {
      const next: CallHandlerSettings = {
        ...prev,
        voiceId,
        voicePicked: voiceId !== shownVoice.voiceId || shownVoice.custom,
      };
      delete next.customVoice;
      return next;
    });
  }
  function updateEscalation(patch: Partial<EscalationSettings>) {
    setEscalationForm((prev) => ({ ...prev, ...patch }));
  }
  function toggleNotification(key: keyof NotificationSettings) {
    setNotificationsForm((n) => ({ ...n, [key]: !n[key] }));
  }
  function chooseHandoff(mode: EscalationSettings["mode"]) {
    updateEscalation({
      mode,
      transferNumber:
        mode === "transfer"
          ? escalationForm.transferNumber || savedEscalation.transferNumber
          : savedEscalation.mode === "sms"
            ? savedEscalation.transferNumber
            : "",
    });
  }
  const greetingCompany = company?.name?.trim() || "the company";
  const filledGreeting = fillGreeting(callHandlerForm.greeting ?? "", greetingCompany);
  const greetingLength = filledGreeting.length;
  const greetingOverCap = greetingLength > GREETING_MAX;
  const greetingPreview = filledGreeting.slice(0, GREETING_MAX).trim();
  function editGreeting(next: string) {
    const length = fillGreeting(next, greetingCompany).length;
    if (length > GREETING_MAX && length > greetingLength) {
      return;
    }
    updateCallHandlerField("greeting", next);
  }
  function insertCompanyName() {
    const box = greetingRef.current;
    const text = callHandlerForm.greeting;
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? text.length;
    editGreeting(`${text.slice(0, start)}{company}${text.slice(end)}`);
    box?.focus();
  }
  function transferLoopsBack(): boolean {
    return (
      escalationForm.mode === "transfer" &&
      dialedDigits(escalationForm.transferNumber) !== "" &&
      sameDialedNumber(escalationForm.transferNumber, company?.phone ?? "")
    );
  }
  function tunedVoiceNote(): string {
    const tuned = callHandlerForm.tunedVoice ?? callHandlerForm.customVoice;
    if (!tuned) {
      return "None - the voice picked above is in use.";
    }
    const what = [tuned.provider, tuned.model].filter(Boolean).join(" ");
    if (callHandlerForm.customVoice) {
      return `In use (${what}). Picking a voice above replaces it.`;
    }
    const shownAs =
      voiceOptions.find((voice) => voice.id === savedCallHandler.voiceId)?.name ??
      savedCallHandler.voiceId;
    return `In use (${what}), shown above as ${shownAs}. Picking another voice replaces it.`;
  }
  const bookingWindowsCheck = validateBookingWindows(bookingWindowsForm);
  const storedPromptStyle = (
    callHandlerForm as {
      promptStyle?: unknown;
    }
  ).promptStyle;
  const promptStyle =
    typeof storedPromptStyle === "string" && storedPromptStyle.toLowerCase() === "lean"
      ? "Lean"
      : "Full (default)";
  function callHandlerChanges(): Partial<CallHandlerSettings> | null {
    const changes: Partial<CallHandlerSettings> =
      changedFields(savedCallHandler, callHandlerForm, [
        "voiceId",
        "customVoice",
        "voicePicked",
        "tunedVoice",
        "voiceMatchUnavailable",
      ]) ?? {};
    if (callHandlerForm.voicePicked) {
      changes.voiceId = callHandlerForm.voiceId;
      changes.voicePicked = true;
    }
    return Object.keys(changes).length > 0 ? changes : null;
  }
  function phoneSavePlan() {
    const transferChanges = changedFields(savedEscalation, escalationForm, ["ownerPhone"]);
    return {
      escalation: transferChanges,
      fees: feesPayload(),
      notifications: changedFields(savedNotifications, notificationsForm),
      emergency: emergencyPayload(savedEmergency, emergencyForm),
      bookingWindows: bookingWindowsChange(),
      callHandler: callHandlerChanges(),
    };
  }
  function bookingWindowsChange(): BookingWindow[] | null {
    const checked = validateBookingWindows(bookingWindowsForm);
    if (!checked.ok) {
      return null;
    }
    return JSON.stringify(checked.windows) === JSON.stringify(savedBookingWindows)
      ? null
      : checked.windows;
  }
  async function saveCallHandlerSettings() {
    if (activeSaves.current > 0 || !bookingWindowsCheck.ok) {
      return;
    }
    setSavingCallHandler(true);
    const plan = phoneSavePlan();
    const owedBefore = pushOwed;
    const results: SettingsSaveResult[] = [];
    let resync: SettingsSaveResult | null = null;
    beginPushingSave();
    try {
      const { escalation, notifications } = plan;
      if (escalation) {
        const result = await updateSettingsSection("escalation", escalation);
        if (!result.settings?.escalation) {
          throw new Error("Scout did not return the saved transfer settings");
        }
        const saved = { ...savedEscalation, ...result.settings.escalation };
        setEscalationForm((form) => rebaseForm(form, savedEscalation, saved, escalation));
        setSavedEscalation(saved);
        results.push(result);
      }
      if (plan.fees) {
        await saveFees(plan.fees, results);
      }
      if (notifications) {
        const result = await updateSettingsSection("notifications", notifications);
        const saved = { ...savedNotifications, ...result.settings?.notifications };
        setNotificationsForm((form) => rebaseForm(form, savedNotifications, saved, notifications));
        setSavedNotifications(saved);
      }
      if (plan.bookingWindows) {
        const sent = plan.bookingWindows;
        const result = await saveBookingWindows(sent, savedBookingWindows);
        const saved = result.settings?.bookingWindows ?? sent;
        setBookingWindowsForm((form) => {
          const now = validateBookingWindows(form);
          return now.ok && JSON.stringify(now.windows) === JSON.stringify(sent) ? saved : form;
        });
        setSavedBookingWindows(saved);
      }
      if (plan.emergency) {
        const result = await updateSettingsSection("company", plan.emergency);
        if (result.settings?.company) {
          setCompany(result.settings.company);
        }
        const saved = result.settings?.company
          ? readEmergencyRules(result.settings.company)
          : emergencyForm;
        setEmergencyForm(saved);
        setSavedEmergency(saved);
        results.push(result);
      }
      if (plan.callHandler) {
        const result = await updateSettingsSection("callHandler", plan.callHandler);
        if (!result.settings?.callHandler) {
          throw new Error("Scout did not return the saved phone settings");
        }
        const reported: CallHandlerSettings = { ...result.settings.callHandler };
        delete reported.voicePicked;
        if (reported.voiceMatchUnavailable) {
          voiceRefreshOwed.current = true;
        }
        const saved: CallHandlerSettings = reported.voiceMatchUnavailable
          ? {
              ...reported,
              voiceId: callHandlerForm.voiceId,
              customVoice: callHandlerForm.customVoice,
            }
          : reported;
        setCallHandlerForm(saved);
        setShownVoice({ voiceId: saved.voiceId, custom: Boolean(saved.customVoice) });
        setSavedCallHandler(saved);
        results.push(result);
      }
      if (owedBefore) {
        voiceRefreshOwed.current = true;
        resync = await resyncPhone();
        results.push(resync);
      }
      reportSettingsSave(results, "Updated - changes take effect on next call");
    } catch (err) {
      addToast("error", (err as Error).message || "Failed to update phone settings");
    } finally {
      setSavingCallHandler(false);
      endPushingSave("other", results, resync);
    }
  }
  async function saveAlertPhone() {
    if (activeSaves.current > 0) {
      return;
    }
    setSavingAlertPhone(true);
    const results: SettingsSaveResult[] = [];
    beginPushingSave();
    try {
      const result = await updateSettingsSection("escalation", { ownerPhone: alertPhone });
      results.push(result);
      const saved = result.settings?.escalation;
      if (!saved) {
        throw new Error("Scout did not return the saved alerts number");
      }
      setEscalationForm((form) => rebaseForm(form, savedEscalation, saved, { ownerPhone: true }));
      if (
        JSON.stringify(escalationForm.additionalPhones) ===
        JSON.stringify(savedEscalation.additionalPhones)
      ) {
        setAdditionalPhonesDraft((saved.additionalPhones ?? []).join(", "));
      }
      setSavedEscalation(saved);
      setAlertPhone(formatPhone(saved.ownerPhone));
      reportSettingsSave(
        [result],
        saved.ownerPhone ? "Alerts number saved" : "Alerts number cleared",
      );
    } catch (err) {
      addToast("error", (err as Error).message || "Failed to save the alerts number");
    } finally {
      setSavingAlertPhone(false);
      endPushingSave("other", results, null);
    }
  }
  function previewVoice(voice: VoiceOption) {
    const playing = previewAudioRef.current;
    previewAudioRef.current = null;
    if (playing) {
      playing.pause();
      if (playing.dataset.voiceId === voice.id) {
        return;
      }
    }
    const audio = new Audio(`/voice-previews/${voice.id}.mp3`);
    audio.dataset.voiceId = voice.id;
    previewAudioRef.current = audio;
    audio.addEventListener(
      "error",
      () => addToast("error", `No preview clip for ${voice.name} yet`),
      { once: true },
    );
    void audio.play().catch(() => {
      addToast("error", `No preview clip for ${voice.name} yet`);
    });
  }
  function openAddKnowledge() {
    setEditingKnowledge(null);
    setKnowledgeForm({ topic: "", content: "", source: "" });
    setKnowledgeModalOpen(true);
  }
  function openEditKnowledge(entry: KnowledgeEntry) {
    setEditingKnowledge(entry);
    setKnowledgeForm({ topic: entry.topic, content: entry.content, source: entry.source });
    setKnowledgeModalOpen(true);
  }
  async function saveKnowledge() {
    if (activeSaves.current > 0) {
      return;
    }
    setSaving(true);
    const results: SettingsSaveResult[] = [];
    beginPushingSave();
    try {
      const result = await saveKnowledgeChange({
        op: "upsert",
        topic: knowledgeForm.topic,
        content: knowledgeForm.content,
        ...(editingKnowledge ? { replaces: editingKnowledge.key } : {}),
      });
      results.push(result);
      const saved = Array.isArray(result.settings?.knowledge)
        ? result.settings.knowledge
        : knowledge;
      setKnowledge(saved);
      const failed = typeof result.callHandlerPush === "object";
      if (failed) {
        const topic = knowledgeForm.topic.trim();
        setEditingKnowledge(saved.find((k) => k.topic === topic) ?? saved[saved.length - 1]);
      }
      setKnowledgeModalOpen(failed);
      reportSettingsSave([result], editingKnowledge ? "Entry updated" : "Entry added");
    } catch {
      addToast("error", "Failed to save knowledge entry");
    } finally {
      setSaving(false);
      endPushingSave("knowledge", results, null);
    }
  }
  async function deleteKnowledge(id: string) {
    if (activeSaves.current > 0 || !confirm("Delete this knowledge entry?")) {
      return;
    }
    setSaving(true);
    const results: SettingsSaveResult[] = [];
    beginPushingSave();
    try {
      const entry = knowledge.find((k) => k.id === id);
      if (!entry) {
        return;
      }
      const result = await saveKnowledgeChange({ op: "remove", key: entry.key });
      results.push(result);
      setKnowledge(
        Array.isArray(result.settings?.knowledge)
          ? result.settings.knowledge
          : knowledge.filter((k) => k.id !== id),
      );
      if (typeof result.callHandlerPush === "object" && result.phoneSync?.state !== "retrying") {
        addToast(
          "error",
          "Entry deleted, but the phone hasn't received the change. Please check with support before relying on it.",
        );
      } else {
        reportSettingsSave([result], "Entry deleted");
      }
    } catch {
      addToast("error", "Failed to delete entry");
    } finally {
      setSaving(false);
      endPushingSave("knowledge", results, null);
    }
  }
  return (
    <div className="flex min-h-0 w-full flex-1">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <nav className="hidden w-64 shrink-0 flex-col gap-1 overflow-y-auto bg-paper-2/70 p-4 sm:flex">
        <p className="px-3 pt-2 pb-4 font-display text-h2 font-medium text-ink">Settings</p>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? "page" : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-left text-body font-medium transition-colors ${
              activeTab === id
                ? "bg-tan-soft/80 text-ink"
                : "text-ink-2 hover:bg-tan-soft/40 hover:text-ink"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          ref={tabStripRef}
          className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 sm:hidden"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? "page" : undefined}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-body font-semibold transition-colors ${activeTab === id ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 active:bg-tan-soft"}`}
            >
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>

        <div
          ref={scrollRef}
          onScroll={applyScrollFade}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-[calc(2rem+var(--safe-b))] sm:px-12 sm:pt-16 sm:pb-12"
        >
          {phoneSync && phoneSync.state in PHONE_SYNC_BANNER && (
            <div
              role="status"
              className="mb-5 flex items-start gap-3 rounded-2xl bg-terracotta-tint px-4 py-3 sm:mr-10"
            >
              {phoneSync.state === "retrying" ? (
                <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-terracotta-deep" />
              ) : (
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-terracotta-deep" />
              )}
              <div className="min-w-0 flex-1 text-body text-ink">
                <p>{PHONE_SYNC_BANNER[phoneSync.state as keyof typeof PHONE_SYNC_BANNER]}</p>
                {phoneSync.refusal && (
                  <p className="mt-1 text-ink-2">
                    {PHONE_SYNC_REFUSAL_LINE} {phoneSync.refusal}
                  </p>
                )}
              </div>
              {phoneSync.state !== "retrying" && (
                <button
                  type="button"
                  onClick={() => setPhoneSync(null)}
                  aria-label="Dismiss"
                  className="shrink-0 text-ink-3 hover:text-ink"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {activeTab === "overview" && (
            <div className="space-y-7">
              <div>
                <p className="mb-3 text-label font-semibold tracking-[0.14em] uppercase text-terracotta">
                  Make Scout yours
                </p>
                <h2 className="font-display text-h1 text-ink">Your shop. Your way.</h2>
                <p className="mt-2 text-body-lg text-ink-2">
                  The essentials, in one place. Choose what you want to adjust.
                </p>
              </div>
              <OnboardingChecklist />

              <section
                aria-labelledby="alerts-settings-title"
                className="rounded-2xl bg-paper-2 p-5"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="rounded-full bg-sage-tint p-2.5 text-sage-deep">
                    <Bell size={20} strokeWidth={1.8} />
                  </span>
                  <h3 id="alerts-settings-title" className="text-body font-semibold text-ink">
                    Alerts
                  </h3>
                </div>
                <label
                  htmlFor="alert-phone"
                  className="mb-1.5 block text-body font-medium text-ink-2"
                >
                  Send Scout&rsquo;s alerts to
                </label>
                <input
                  id="alert-phone"
                  type="tel"
                  value={alertPhone}
                  onChange={(e) => setAlertPhone(e.target.value)}
                  placeholder="(555) 555-0100"
                  className="field w-full py-2"
                />
                <p className="mt-1.5 text-label text-ink-3">
                  Booking summaries and &lsquo;a customer needs you&rsquo; texts go to this number -
                  the owner, the front office or dispatch. If the phone system ever goes down,
                  callers ring here instead of hearing nothing.
                </p>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="primary"
                    size="md"
                    pill
                    icon={
                      savingAlertPhone ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )
                    }
                    onClick={() => void saveAlertPhone()}
                    disabled={
                      !escalationLoaded ||
                      savingAlertPhone ||
                      pushingSave ||
                      sameDialedNumber(alertPhone, savedEscalation.ownerPhone ?? "")
                    }
                  >
                    Save number
                  </Button>
                </div>
              </section>
              <BuddySettings />
              <div className="relative">
                <Search
                  size={18}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3"
                />
                <input
                  aria-label="Find a setting"
                  value={sectionSearch}
                  onChange={(event) => setSectionSearch(event.target.value)}
                  placeholder="Find a setting… try hours, voice, or booking"
                  className="field w-full rounded-full py-3 pr-4 pl-11"
                />
              </div>
              {["Your business", "How Scout works", "Connections"].map((group) => {
                const matches = tabs.filter(
                  (tab) =>
                    SECTION_DETAILS[tab.id]?.group === group &&
                    `${tab.label} ${SECTION_DETAILS[tab.id].description}`
                      .toLowerCase()
                      .includes(sectionSearch.trim().toLowerCase()),
                );
                if (!matches.length) {
                  return null;
                }
                return (
                  <section key={group}>
                    <h3 className="mb-3 px-1 text-body font-semibold text-ink-2">{group}</h3>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      {matches.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setActiveTab(id)}
                          className="group flex items-start gap-4 rounded-2xl bg-paper-2 p-4 text-left transition-colors hover:bg-tan-soft/60 active:bg-tan-soft sm:p-5"
                        >
                          <span className="rounded-full bg-sage-tint p-2.5 text-sage-deep">
                            <Icon size={20} strokeWidth={1.8} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-body-lg font-semibold text-ink">
                              {label}
                            </span>
                            <span className="mt-1 block text-body leading-snug text-ink-2">
                              {SECTION_DETAILS[id].description}
                            </span>
                          </span>
                          <ArrowUpRight
                            size={16}
                            strokeWidth={1.8}
                            className="mt-1 shrink-0 text-ink-3 group-hover:text-ink"
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
              {!tabs.some(
                (tab) =>
                  SECTION_DETAILS[tab.id] &&
                  `${tab.label} ${SECTION_DETAILS[tab.id].description}`
                    .toLowerCase()
                    .includes(sectionSearch.trim().toLowerCase()),
              ) && (
                <p role="status" className="py-6 text-body text-ink-3">
                  No settings match. Try hours, booking, or voice.
                </p>
              )}
            </div>
          )}

          {activeTab === "company" && company && (
            <div className="space-y-6">
              <OnboardingChecklist />
              <div className="flex flex-wrap items-center justify-between gap-3 sm:pr-10">
                <h2 className="text-title font-semibold text-ink">Company Information</h2>
                {!editingCompany && (
                  <Button
                    variant="primary"
                    size="md"
                    pill
                    icon={<Pencil size={16} />}
                    onClick={startEditCompany}
                  >
                    Edit Company Info
                  </Button>
                )}
              </div>

              {editingCompany ? (
                <>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={companyForm.name}
                        onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                        className="field w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={companyForm.phone}
                        onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                        className="field w-full"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="company-trade"
                        className="mb-1.5 block text-body font-medium text-ink-2"
                      >
                        Trade
                      </label>

                      <select
                        id="company-trade"
                        value={companyForm.trade}
                        onChange={(e) =>
                          setCompanyForm({ ...companyForm, trade: e.target.value as ShopTrade })
                        }
                        className="field w-full"
                      >
                        {SHOP_TRADE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-body font-medium text-ink-2">
                        Service Area
                      </label>
                      <div className="mb-4 inline-flex rounded-full bg-paper-2 p-1">
                        {(["radius", "list"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() =>
                              setCompanyForm((current) => ({
                                ...current,
                                serviceArea: { ...current.serviceArea, mode },
                              }))
                            }
                            className={`rounded-full px-4 py-2 text-body font-medium transition-colors ${
                              companyForm.serviceArea.mode === mode
                                ? "bg-paper text-ink shadow-soft"
                                : "text-ink-3 hover:text-ink"
                            }`}
                          >
                            {mode === "radius" ? "Radius" : "ZIP / City list"}
                          </button>
                        ))}
                      </div>
                      {companyForm.serviceArea.mode === "radius" ? (
                        <div>
                          <label className="mb-1.5 block text-body font-medium text-ink-2">
                            Company location
                          </label>
                          <input
                            type="text"
                            value={companyForm.serviceArea.centerAddress}
                            onChange={(e) =>
                              setCompanyForm((current) => ({
                                ...current,
                                serviceArea: {
                                  ...current.serviceArea,
                                  centerAddress: e.target.value,
                                },
                              }))
                            }
                            placeholder="123 Main Street, Framingham, MA 01701"
                            className="field mb-3 w-full"
                          />
                          <div className="flex max-w-xs items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={250}
                              value={companyForm.serviceArea.radiusMiles}
                              onChange={(e) =>
                                setCompanyForm((current) => ({
                                  ...current,
                                  serviceArea: {
                                    ...current.serviceArea,
                                    radiusMiles: Number(e.target.value),
                                  },
                                }))
                              }
                              className="field w-28"
                            />
                            <span className="text-body text-ink-2">
                              miles from the company location
                            </span>
                          </div>
                          <p className="mt-2 text-label text-ink-4">
                            Scout measures the caller&apos;s address from this location before
                            booking.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <textarea
                            value={companyForm.serviceArea.locations.join("\n")}
                            onChange={(e) =>
                              setCompanyForm((current) => ({
                                ...current,
                                serviceArea: {
                                  ...current.serviceArea,
                                  locations: e.target.value.split(/\n+/),
                                },
                              }))
                            }
                            rows={4}
                            placeholder={"01701\nFramingham, MA\nMarlborough"}
                            className="field w-full"
                          />
                          <p className="mt-2 text-label text-ink-4">
                            Enter one ZIP code or city per line.
                          </p>
                        </div>
                      )}
                      <label
                        htmlFor="service-area-notes"
                        className="mb-1.5 mt-4 block text-body font-medium text-ink-2"
                      >
                        Service area notes{" "}
                        <span className="font-normal text-ink-4">(optional)</span>
                      </label>
                      <textarea
                        id="service-area-notes"
                        value={companyForm.serviceArea.notes}
                        onChange={(e) =>
                          setCompanyForm((current) => ({
                            ...current,
                            serviceArea: { ...current.serviceArea, notes: e.target.value },
                          }))
                        }
                        rows={2}
                        placeholder="Add exceptions, referral-only areas, or other instructions"
                        className="field w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Business Hours
                      </label>

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          aria-label="Opens at"
                          value={companyForm.hours.start}
                          onChange={(e) =>
                            setCompanyForm({
                              ...companyForm,
                              hours: { ...companyForm.hours, start: e.target.value },
                            })
                          }
                          className="field w-32"
                        />
                        <span className="text-body text-ink-3">to</span>
                        <input
                          type="time"
                          aria-label="Closes at"
                          value={companyForm.hours.end}
                          onChange={(e) =>
                            setCompanyForm({
                              ...companyForm,
                              hours: { ...companyForm.hours, end: e.target.value },
                            })
                          }
                          className="field w-32"
                        />
                        <select
                          aria-label="Timezone"
                          value={companyForm.hours.timezone}
                          onChange={(e) =>
                            setCompanyForm({
                              ...companyForm,
                              hours: { ...companyForm.hours, timezone: e.target.value },
                            })
                          }
                          className="field"
                        >
                          {!companyBaseline?.hours.timezone && <option value="">Timezone…</option>}
                          <option value="America/Los_Angeles">Pacific</option>
                          <option value="America/Phoenix">Arizona</option>
                          <option value="America/Denver">Mountain</option>
                          <option value="America/Chicago">Central</option>
                          <option value="America/New_York">Eastern</option>
                          <option value="America/Anchorage">Alaska</option>
                          <option value="Pacific/Honolulu">Hawaii</option>
                        </select>
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Days open
                      </label>

                      <div className="rounded-2xl bg-paper-2 py-1">
                        {WEEKDAY_ROWS.map((row) => {
                          const day = companyForm.hours.days[row.key];
                          return (
                            <div
                              key={row.key}
                              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                            >
                              <span className="w-24 text-body font-medium text-ink">
                                {row.label}
                              </span>
                              <button
                                type="button"
                                aria-label={`${row.label} open`}
                                aria-pressed={day.open}
                                onClick={() => setBusinessDay(row.key, { open: !day.open })}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${day.open ? "bg-terracotta" : "bg-tan"}`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${day.open ? "translate-x-6" : "translate-x-1"}`}
                                />
                              </button>
                              {day.open ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="time"
                                    aria-label={`${row.label} opens at`}
                                    value={day.start ?? ""}
                                    onChange={(e) =>
                                      setBusinessDay(row.key, { start: e.target.value })
                                    }
                                    className="field py-2"
                                  />
                                  <span className="text-body text-ink-3">to</span>
                                  <input
                                    type="time"
                                    aria-label={`${row.label} closes at`}
                                    value={day.end ?? ""}
                                    onChange={(e) =>
                                      setBusinessDay(row.key, { end: e.target.value })
                                    }
                                    className="field py-2"
                                  />
                                  <span className="text-label text-ink-4">
                                    Leave blank to use the hours above.
                                  </span>
                                </div>
                              ) : (
                                <span className="text-label text-ink-4">Closed</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="closed-date-input"
                        className="mb-1.5 block text-body font-medium text-ink-2"
                      >
                        Closed dates{" "}
                        <span className="font-normal text-ink-4">(holidays, vacations)</span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          id="closed-date-input"
                          type="date"
                          value={closedDateDraft}
                          onChange={(e) => setClosedDateDraft(e.target.value)}
                          className="field py-2"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const d = closedDateDraft.trim();
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                              return;
                            }
                            setCompanyForm((f) =>
                              (f.hours.closedDates ?? []).includes(d)
                                ? f
                                : {
                                    ...f,
                                    hours: {
                                      ...f.hours,
                                      closedDates: [...(f.hours.closedDates ?? []), d].toSorted(),
                                    },
                                  },
                            );
                            setClosedDateDraft("");
                          }}
                          disabled={!closedDateDraft}
                        >
                          Add closed date
                        </Button>
                      </div>
                      {(companyForm.hours.closedDates ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(companyForm.hours.closedDates ?? []).map((d) => (
                            <button
                              key={d}
                              type="button"
                              aria-label={`Remove closed date ${d}`}
                              onClick={() =>
                                setCompanyForm((f) => ({
                                  ...f,
                                  hours: {
                                    ...f.hours,
                                    closedDates: (f.hours.closedDates ?? []).filter((x) => x !== d),
                                  },
                                }))
                              }
                              className="min-h-9 rounded-pill bg-paper-2 px-3.5 text-label font-medium text-ink hover:bg-tan-soft"
                            >
                              {d} ✕
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-label text-ink-4">
                        Scout will not book these days and treats them as after-hours. Saved with
                        Company info.
                      </p>
                    </div>
                    <div>
                      <label
                        htmlFor="min-booking-notice"
                        className="mb-1.5 block text-body font-medium text-ink-2"
                      >
                        Minimum booking notice
                      </label>
                      <select
                        id="min-booking-notice"
                        value={feesForm.minBookingNoticeHours}
                        onChange={(e) => {
                          setFeesForm((f) => ({
                            ...f,
                            minBookingNoticeHours: Number(e.target.value) as BookingNoticeHours,
                          }));
                        }}
                        className="field w-full"
                      >
                        {BOOKING_NOTICE_ROWS.map((row) => (
                          <option key={row.value} value={row.value}>
                            {row.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-label text-ink-4">
                        How far out the soonest appointment Scout offers has to be.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-body font-medium text-ink-2">
                      Where customers pay
                    </label>
                    <div className="rounded-2xl bg-paper-2 px-4 py-3.5">
                      <p className="text-body font-medium text-ink">Payment link</p>
                      <p className="mb-2 text-label text-ink-3">
                        Your online payment page - ServiceTitan customers use their portal (e.g.
                        https://yourshop.myservicetitan.com). This becomes the &ldquo;Pay
                        online&rdquo; button on every invoice you text. Leave empty and Scout tells
                        customers to call instead.
                      </p>
                      <input
                        type="url"
                        value={feesForm.paymentUrl}
                        onChange={(e) => {
                          setFeesForm((f) => ({ ...f, paymentUrl: e.target.value }));
                        }}
                        className="field w-full py-2"
                        placeholder="https://yourshop.myservicetitan.com"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="md"
                      pill
                      icon={
                        saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />
                      }
                      onClick={() => void saveCompany()}
                      disabled={saving || pushingSave}
                    >
                      Save Changes
                    </Button>
                    <Button variant="secondary" size="md" onClick={() => setEditingCompany(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Company Name
                      </label>
                      <div className="flex items-center gap-2.5 rounded-xl bg-paper-2 px-3.5 py-3 text-body text-ink">
                        <Building2 size={16} className="text-ink-4" />

                        {company.name || (
                          <span className="text-ink-4">Not set - add your company name</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Phone Number
                      </label>
                      <div className="flex items-center gap-2.5 rounded-xl bg-paper-2 px-3.5 py-3 text-body text-ink">
                        <Phone size={16} className="text-ink-4" />
                        {formatPhone(company.phone)}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">Trade</label>
                      <div className="flex items-center gap-2.5 rounded-xl bg-paper-2 px-3.5 py-3 text-body text-ink">
                        <Wrench size={16} className="text-ink-4" />
                        {SHOP_TRADE_OPTIONS.find((option) => option.value === company.trade)
                          ?.label ?? "HVAC"}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Service Area
                      </label>
                      <div className="flex items-center gap-2.5 rounded-xl bg-paper-2 px-3.5 py-3 text-body text-ink">
                        <MapPin size={16} className="text-ink-4" />
                        <span>
                          {company.serviceArea.summary}
                          {company.serviceArea.notes && (
                            <span className="mt-1 block text-label text-ink-4">
                              {company.serviceArea.notes}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-body font-medium text-ink-2">
                        Business Hours
                      </label>
                      <div className="flex items-center gap-2.5 rounded-xl bg-paper-2 px-3.5 py-3 text-body text-ink">
                        <Clock size={16} className="text-ink-4" />
                        <span>
                          {company.businessHours}

                          <span className="mt-1 block text-label text-ink-4">
                            {summarizeOpenDays(company.hours.days)}
                          </span>
                          {summarizeClosedDates(company.hours.closedDates, clock) && (
                            <span className="block text-label text-ink-4">
                              {summarizeClosedDates(company.hours.closedDates, clock)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "crm" && <CrmConnectionSection />}

          {activeTab === "booking" && (
            <BookingMapSection addToast={addToast} trade={company?.trade} />
          )}

          {speedToLead && activeTab === "google-lsa" && <GoogleLsaSettings />}
          {speedToLead && activeTab === "meta" && <MetaSettings />}

          {activeTab === "integrations" && (
            <div className="space-y-6">
              <div className="sm:pr-10">
                <h2 className="text-title font-semibold text-ink">AI Model</h2>

                <p className="mt-1 text-body text-ink-3">
                  ScoutAI answers your chat and your customers&apos; texts. Connect it once here and
                  it stays connected. There is no key to paste and nothing to install.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <h3 className="text-body font-semibold text-ink">ScoutAI</h3>

                {codexAuth.signedIn ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sage-tint px-4 py-3">
                    <CheckCircle2 size={18} className="shrink-0 text-sage-deep" />
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-body font-semibold text-sage-deep">ScoutAI — connected</p>
                      <p className="text-label text-ink-2">Scout&apos;s AI is linked and ready.</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => void signOutCodex()}
                      disabled={signingOutCodex}
                      icon={
                        signingOutCodex ? <Loader2 size={14} className="animate-spin" /> : undefined
                      }
                    >
                      Sign out
                    </Button>
                  </div>
                ) : codexPairingActive ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-golden-tint px-4 py-3">
                    <Loader2 size={18} className="shrink-0 animate-spin text-copper" />
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-body font-semibold text-copper">
                        Waiting for you to finish in your browser
                      </p>
                      <p className="text-label text-ink-2">
                        Enter the code at {codexAuth.pairing?.verificationUrl} to finish connecting.
                      </p>
                    </div>
                    {!codexPairingOpen && (
                      <Button variant="primary" size="md" onClick={() => setCodexPairingOpen(true)}>
                        Show the code
                      </Button>
                    )}
                  </div>
                ) : codexAuth.gatewayUnreachable ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-golden-tint px-4 py-3">
                    <AlertCircle size={18} className="shrink-0 text-copper" />
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-body font-semibold text-copper">
                        Cannot reach Scout right now
                      </p>
                      <p className="text-label text-ink-2">
                        Sign-in needs Scout running. This page retries when you reopen Settings.
                      </p>
                    </div>
                    <Button variant="primary" size="md" disabled>
                      Connect ScoutAI
                    </Button>
                  </div>
                ) : modelAccess === "backup-key" ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-golden-tint px-4 py-3">
                    <CheckCircle2 size={18} className="shrink-0 text-copper" />
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-body font-semibold text-copper">
                        {MODEL_ACCESS_COPY["backup-key"].title}
                      </p>
                      <p className="text-label text-ink-2">
                        {MODEL_ACCESS_COPY["backup-key"].detail}
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => void startCodexSignIn()}
                      disabled={startingCodexSignIn}
                      icon={
                        startingCodexSignIn ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Sparkles size={14} />
                        )
                      }
                    >
                      Connect ScoutAI
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-terracotta-tint px-4 py-3">
                    <AlertCircle size={18} className="shrink-0 text-terracotta-deep" />
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-body font-semibold text-terracotta-deep">
                        {MODEL_ACCESS_COPY.none.title}
                      </p>
                      <p className="text-label text-ink-2">{MODEL_ACCESS_COPY.none.detail}</p>
                    </div>
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => void startCodexSignIn()}
                      disabled={startingCodexSignIn}
                      icon={
                        startingCodexSignIn ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Sparkles size={14} />
                        )
                      }
                    >
                      Connect ScoutAI
                    </Button>
                  </div>
                )}

                <p className="text-label text-ink-3">
                  Connecting opens a short code you enter on a secure sign-in page. Scout never sees
                  your password, and you can disconnect here at any time.
                </p>
              </div>

              <Modal
                open={codexPairingOpen && Boolean(codexAuth.pairing)}
                onClose={() => void cancelCodexPairing()}
                title="Connect ScoutAI"
              >
                {codexAuth.pairing && (
                  <div className="space-y-5">
                    <p className="text-body text-ink-2">
                      Open this link on any phone or computer, sign in, and enter the code below
                      when it asks. This window closes on its own once you are done.
                    </p>

                    <div className="space-y-1.5">
                      <p className="text-body font-medium text-ink-2">Step 1. Open this link</p>
                      <a
                        href={codexAuth.pairing.verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-between gap-2 rounded-2xl bg-terracotta-tint px-4 py-3 text-body font-medium text-terracotta-deep transition-colors hover:bg-terracotta-soft"
                      >
                        <span className="truncate font-mono">
                          {codexAuth.pairing.verificationUrl}
                        </span>
                        <ExternalLink size={14} className="shrink-0" />
                      </a>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-body font-medium text-ink-2">Step 2. Enter this code</p>

                      <button
                        type="button"
                        onClick={() => void copyCodexCode()}
                        aria-label={`Copy the code ${codexAuth.pairing.userCode}`}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-paper-2 px-4 py-4 text-left transition-colors hover:bg-terracotta-tint"
                      >
                        <span className="break-all font-mono text-h1 font-bold tracking-[0.18em] text-ink">
                          {codexAuth.pairing.userCode}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-label font-semibold text-ink-3">
                          <Copy size={14} />
                          {codexCodeCopied ? "Copied" : "Copy"}
                        </span>
                      </button>
                    </div>

                    {codexFailed && !codexResult?.ok ? (
                      codexResult.failureCode === "device_auth_disabled" ? (
                        <div className="space-y-3 rounded-2xl bg-golden-tint px-3 py-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-copper" />
                            <div>
                              <p className="text-body font-semibold text-copper">
                                One more step in your account
                              </p>
                              <p className="mt-1 text-label text-ink-2">
                                Your account needs device sign-in switched on. Open the settings
                                page, turn on{" "}
                                <span className="font-medium">Device authorization</span>, then come
                                back and get a new code.
                              </p>
                            </div>
                          </div>
                          <a
                            href="https://chatgpt.com/codex/settings"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-pill bg-copper px-3 py-1.5 text-label font-semibold text-paper hover:opacity-90"
                          >
                            Open account settings
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 rounded-2xl bg-alarm-tint px-3 py-2.5">
                          <AlertCircle size={14} className="mt-0.5 shrink-0 text-alarm" />
                          <div>
                            <p className="text-body font-semibold text-alarm">Sign-in failed</p>
                            <p className="mt-0.5 text-label text-ink-2">{codexResult.error}</p>
                          </div>
                        </div>
                      )
                    ) : codexExpired ? (
                      <div className="flex items-start gap-2 rounded-2xl bg-golden-tint px-3 py-2.5">
                        <Clock size={14} className="mt-0.5 shrink-0 text-copper" />
                        <div>
                          <p className="text-body font-semibold text-copper">This code expired</p>
                          <p className="mt-0.5 text-label text-ink-2">
                            Codes are only good for a few minutes. Get a new one and it will work
                            the same way.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 rounded-2xl bg-paper-2 px-4 py-3 text-body">
                        <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-ink-3" />
                        <span className="text-ink-3">
                          Waiting for you to enter the code.
                          {codexMsRemaining > 0
                            ? ` It expires in ${formatCodexRemaining(codexMsRemaining)}.`
                            : ""}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => void cancelCodexPairing()}
                      >
                        Cancel
                      </Button>
                      {(codexFailed || codexExpired) && (
                        <Button
                          variant="primary"
                          size="md"
                          pill
                          onClick={() => void restartCodexSignIn()}
                          disabled={startingCodexSignIn}
                        >
                          {codexExpired ? "Get a new code" : "Try again"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Modal>
            </div>
          )}

          {features.settingsPricebook && activeTab === "services" && (
            <div className="space-y-6">
              <h2 className="text-title font-semibold text-ink">Price Book</h2>

              <div className="inline-flex gap-1 rounded-full bg-paper-2 p-1 text-body">
                {(
                  [
                    ["items", "Price Book"],
                    ["labour", "Labour"],
                    ["tax", "Tax Rates"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPbView(id)}
                    className={`min-h-9 rounded-full px-4 font-medium transition-colors ${pbView === id ? "bg-paper text-ink shadow-soft" : "text-ink-2 hover:text-ink"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {pbView === "items" && (
                <div className="space-y-3">
                  <div>
                    {pbCount !== null && pbCount > 0 && (
                      <p className="text-body text-ink-3">{pbCount.toLocaleString()} items</p>
                    )}
                    {pbCount === 0 && (
                      <p className="text-body text-ink-3">No price book uploaded yet.</p>
                    )}
                  </div>

                  {pbCount !== 0 && (
                    <>
                      <input
                        type="text"
                        value={pbQuery}
                        onChange={(e) => {
                          setPbQuery(e.target.value);
                          setPbPage(0);
                        }}
                        placeholder="Search the price book by name or code…"
                        className="field w-full py-2"
                      />

                      <div className="overflow-hidden rounded-2xl bg-paper-2/60">
                        <table className="w-full text-left text-body">
                          <thead>
                            <tr className="bg-paper-2">
                              <th className="px-4 py-3 font-medium text-ink-3">Item</th>
                              <th className="px-4 py-3 font-medium text-ink-3">Code</th>
                              <th className="px-4 py-3 font-medium text-ink-3">Type</th>
                              <th className="px-4 py-3 font-medium text-ink-3 text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-tan-soft/70">
                            {pbLoading ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                                  <Loader2 size={16} className="mx-auto animate-spin" />
                                </td>
                              </tr>
                            ) : pbItems.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                                  {pbQuery.trim() ? `No items match "${pbQuery}".` : "No items."}
                                </td>
                              </tr>
                            ) : (
                              pbItems.map((item) => (
                                <tr key={item.id} className="hover:bg-cream/60">
                                  <td className="px-4 py-3">
                                    <div className="font-medium text-ink">{item.name}</div>
                                    {item.categoryPath.length > 0 && (
                                      <div className="text-label text-ink-4">
                                        {item.categoryPath.join(" / ")}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-label text-ink-3">
                                    {item.codes[0] ?? "-"}
                                  </td>
                                  <td className="px-4 py-3 capitalize text-ink-3">{item.kind}</td>
                                  <td className="px-4 py-3 text-right text-ink-2">
                                    {typeof item.price === "number"
                                      ? `$${item.price.toFixed(2)}`
                                      : "-"}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {pbTotal > PB_PAGE_SIZE && (
                        <div className="flex items-center justify-between text-body text-ink-3">
                          <span>
                            {`${(pbPage * PB_PAGE_SIZE + 1).toLocaleString()}-${Math.min((pbPage + 1) * PB_PAGE_SIZE, pbTotal).toLocaleString()} of ${pbTotal.toLocaleString()}`}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pbPage === 0 || pbLoading}
                              onClick={() => setPbPage((p) => Math.max(0, p - 1))}
                            >
                              Prev
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={(pbPage + 1) * PB_PAGE_SIZE >= pbTotal || pbLoading}
                              onClick={() => setPbPage((p) => p + 1)}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {pbView === "labour" && (
                <div className="overflow-hidden rounded-2xl bg-paper-2/60">
                  <table className="w-full text-left text-body">
                    <thead>
                      <tr className="bg-paper-2">
                        <th className="px-4 py-3 font-medium text-ink-3">Description</th>
                        <th className="px-4 py-3 font-medium text-ink-3 text-right">Hourly cost</th>
                        <th className="px-4 py-3 font-medium text-ink-3 text-right">
                          Hourly price
                        </th>
                        <th className="px-4 py-3 font-medium text-ink-3 text-right">Default</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tan-soft/70">
                      {laborRates === null ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                            <Loader2 size={16} className="mx-auto animate-spin" />
                          </td>
                        </tr>
                      ) : laborRates.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-ink-3">
                            No labour rates yet.
                          </td>
                        </tr>
                      ) : (
                        laborRates.map((r) => (
                          <tr key={r.id} className="hover:bg-cream/60">
                            <td className="px-4 py-3 font-medium text-ink">{r.description}</td>
                            <td className="px-4 py-3 text-right text-ink-3">
                              {typeof r.hourlyCost === "number"
                                ? `$${r.hourlyCost.toFixed(2)}`
                                : "-"}
                            </td>
                            <td className="px-4 py-3 text-right text-ink-2">
                              ${r.hourlyPrice.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right text-ink-3">
                              {r.isDefault ? "Yes" : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {pbView === "tax" && (
                <div className="overflow-hidden rounded-2xl bg-paper-2/60">
                  <table className="w-full text-left text-body">
                    <thead>
                      <tr className="bg-paper-2">
                        <th className="px-4 py-3 font-medium text-ink-3">Description</th>
                        <th className="px-4 py-3 font-medium text-ink-3 text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tan-soft/70">
                      {taxRates === null ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-8 text-center text-ink-3">
                            <Loader2 size={16} className="mx-auto animate-spin" />
                          </td>
                        </tr>
                      ) : taxRates.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-8 text-center text-ink-3">
                            No tax rates yet.
                          </td>
                        </tr>
                      ) : (
                        taxRates.map((r) => (
                          <tr key={r.id} className="hover:bg-cream/60">
                            <td className="px-4 py-3 font-medium text-ink">
                              {r.description}
                              {r.isDefault && (
                                <span className="ml-2 text-label text-ink-4">(default)</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-ink-2">
                              {r.rate.toFixed(3)}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "call-handler" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-title font-semibold text-ink">Phone</h2>
                <p className="mt-1 text-body text-ink-3">
                  How Scout answers your calls. Changes apply from the next call.
                </p>
              </div>

              <PhoneGroup title="Voice">
                {customVoiceActive ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-terracotta-tint px-4 py-3">
                    <input
                      type="radio"
                      name="voiceId"
                      checked
                      readOnly
                      aria-label="Custom voice"
                      className="h-4 w-4 text-terracotta-deep"
                    />
                    <div>
                      <p className="text-body font-medium text-ink">Custom voice</p>
                      <p className="text-label text-ink-3">
                        Tuned for your shop and in use now. Choosing a voice below replaces it.
                      </p>
                    </div>
                  </div>
                ) : null}
                {voiceOptions.length === 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-paper-2 px-4 py-3">
                    <p className="text-label text-ink-2">
                      Voice list unavailable - the phone system isn&apos;t reachable right now. Your
                      current voice is unchanged.
                    </p>
                    {escalationLoaded ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          voiceRefreshOwed.current = true;
                          refreshVoiceIfOwed();
                        }}
                      >
                        Retry
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {voiceOptions.map((voice) => {
                  const selected = !customVoiceActive && callHandlerForm.voiceId === voice.id;
                  return (
                    <label
                      key={voice.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors ${selected ? "bg-terracotta-tint" : "bg-paper-2 hover:bg-tan-soft/60"}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <input
                          type="radio"
                          name="voiceId"
                          value={voice.id}
                          checked={selected}
                          disabled={savingCallHandler}
                          onChange={() => pickVoice(voice.id)}
                          className="h-4 w-4 shrink-0 text-terracotta-deep"
                        />
                        <div className="min-w-0">
                          <p className="text-body font-medium text-ink">{voice.name}</p>
                          <p className="text-label text-ink-3">{voice.description}</p>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        icon={<Play size={12} />}
                        onClick={(e) => {
                          e.preventDefault();
                          previewVoice(voice);
                        }}
                      >
                        Preview
                      </Button>
                    </label>
                  );
                })}
              </PhoneGroup>

              <PhoneGroup title="How Scout answers">
                <label htmlFor="greeting" className="block text-body font-medium text-ink-2">
                  Greeting{" "}
                  {!callHandlerForm.greeting ? (
                    <span className="font-normal text-ink-4">(none set)</span>
                  ) : null}
                </label>
                <textarea
                  id="greeting"
                  ref={greetingRef}
                  value={callHandlerForm.greeting}
                  onChange={(e) => editGreeting(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder={DEFAULT_CALL_HANDLER.greeting}
                  className="field-warm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={insertCompanyName}
                    className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-3 py-1 text-label font-medium text-ink-2 hover:bg-tan-soft"
                  >
                    <Plus size={12} />
                    Company name
                  </button>
                  {greetingOverCap ? (
                    <span className="text-label text-terracotta-deep">
                      Scout only reads the first {GREETING_MAX} characters.
                    </span>
                  ) : null}
                  <span
                    className={`ml-auto text-label ${greetingOverCap ? "text-terracotta-deep" : "text-ink-4"}`}
                  >
                    {greetingLength} / {GREETING_MAX}
                  </span>
                </div>
                {greetingPreview ? (
                  <p className="text-label text-ink-3">
                    Callers hear something like: &ldquo;{greetingPreview}&rdquo;
                  </p>
                ) : (
                  <p className="text-label text-ink-3">
                    None set: Scout opens each call in its own words.
                  </p>
                )}
                <p className="text-label text-ink-4">
                  Scout opens every call with this in its own natural words, and may add the time of
                  day or the caller&rsquo;s name.
                </p>
              </PhoneGroup>

              <PhoneGroup
                title="After hours"
                aside={
                  company ? (
                    <span className="text-label text-ink-3">
                      Your hours: {hoursSummary(company)}{" "}
                      <button
                        type="button"
                        onClick={() => setActiveTab("company")}
                        className="font-medium text-terracotta-deep underline underline-offset-2"
                      >
                        Edit hours
                      </button>
                    </span>
                  ) : null
                }
              >
                <SwitchRow
                  title="Book appointments after hours"
                  detail="Off: Scout still answers every call, takes a message, and tells the caller the office will call back."
                  on={callHandlerForm.afterHoursEnabled}
                  onToggle={() =>
                    updateCallHandlerField("afterHoursEnabled", !callHandlerForm.afterHoursEnabled)
                  }
                />

                {company && (
                  <div className="rounded-2xl bg-paper-2 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-body font-medium text-ink">Book emergencies any time</p>
                        <p className="text-label text-ink-3">
                          {shopTradeCopy(company.trade).emergencyHint}
                        </p>

                        <p className="text-label text-ink-3">
                          Off: emergencies are booked only into your open hours. A call at night can
                          still get the next open slot, but never one outside your hours or on a
                          closed day.
                        </p>
                      </div>
                      <PhoneSwitch
                        label="Book emergencies any time"
                        on={emergencyForm.emergencyAfterHours}
                        onToggle={() =>
                          setEmergencyForm((f) => ({
                            ...f,
                            emergencyAfterHours: !f.emergencyAfterHours,
                          }))
                        }
                      />
                    </div>
                    <label
                      htmlFor="emergency-examples"
                      className="mt-3 mb-1.5 block text-label font-medium text-ink-2"
                    >
                      What counts as an emergency
                    </label>
                    <input
                      id="emergency-examples"
                      type="text"
                      maxLength={200}
                      value={emergencyForm.emergencyExamples}
                      onChange={(e) =>
                        setEmergencyForm((f) => ({ ...f, emergencyExamples: e.target.value }))
                      }
                      placeholder={shopTradeCopy(company.trade).emergencyExamples}
                      className="field w-full py-2"
                    />
                    <p className="mt-1.5 text-label text-ink-4">
                      Scout uses these exact words when deciding what to treat as urgent. Leave
                      blank for your trade's standard set.
                    </p>
                  </div>
                )}
              </PhoneGroup>

              <PhoneGroup title="Booking windows">
                <p className="text-label text-ink-3">
                  What times can customers book? Scout only offers these windows on calls and texts,
                  on every day you&apos;re open. They can start before or end after your office
                  hours. They replace the arrival-window length on the Booking tab.
                </p>
                {bookingWindowsForm.length === 0 ? (
                  <div className="rounded-2xl bg-paper-2 px-4 py-3.5">
                    <p className="text-body text-ink-2">
                      None set - Scout picks windows from your hours.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2" aria-label="Booking windows">
                    {bookingWindowsForm.map((window, index) => (
                      <li key={index} className="rounded-2xl bg-paper-2 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Window ${index + 1} start`}
                            value={window.start}
                            onChange={(e) => {
                              const start = e.target.value;
                              setBookingWindowsForm((list) =>
                                list.map((w, i) => (i === index ? { ...w, start } : w)),
                              );
                            }}
                            className="field py-2"
                          >
                            {WINDOW_TIMES.map((time) => (
                              <option key={time} value={time}>
                                {clockLabel(time)}
                              </option>
                            ))}
                          </select>
                          <span className="text-label text-ink-3">to</span>
                          <select
                            aria-label={`Window ${index + 1} end`}
                            value={window.end}
                            onChange={(e) => {
                              const end = e.target.value;
                              setBookingWindowsForm((list) =>
                                list.map((w, i) => (i === index ? { ...w, end } : w)),
                              );
                            }}
                            className="field py-2"
                          >
                            {WINDOW_TIMES.map((time) => (
                              <option key={time} value={time}>
                                {clockLabel(time)}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="danger"
                            size="sm"
                            iconOnly
                            icon={<X size={16} />}
                            aria-label={`Remove ${bookingWindowLabel(window)}`}
                            onClick={() =>
                              setBookingWindowsForm((list) => list.filter((_, i) => i !== index))
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {!bookingWindowsCheck.ok ? (
                  <p role="alert" className="text-label text-alarm">
                    {bookingWindowsCheck.error}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() =>
                      setBookingWindowsForm((list) => [...list, nextBookingWindow(list)])
                    }
                  >
                    Add window
                  </Button>
                  {WINDOW_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="ghost"
                      size="sm"
                      onClick={() => setBookingWindowsForm(preset.windows)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </PhoneGroup>

              <PhoneGroup title="Prices Scout can say">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-paper-2 px-4 py-3.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <label htmlFor="diagnostic-fee" className="text-body font-medium text-ink">
                      Diagnostic visit
                    </label>
                    <p className="text-label text-ink-3">
                      The one price Scout says out loud. Leave empty and Scout quotes none.
                    </p>
                  </div>
                  <DollarInput
                    id="diagnostic-fee"
                    value={feesForm.diagnosticFee}
                    placeholder="89"
                    onChange={(value) => {
                      setFeesForm((f) => ({ ...f, diagnosticFee: value }));
                    }}
                  />
                </div>
                <div className="rounded-2xl bg-paper-2 px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <label
                      htmlFor="emergency-surcharge"
                      className="min-w-0 flex-1 basis-56 text-body font-medium text-ink"
                    >
                      After-hours emergency surcharge
                    </label>
                    <DollarInput
                      id="emergency-surcharge"
                      value={feesForm.emergencySurcharge}
                      placeholder="150"
                      onChange={(value) => {
                        setFeesForm((f) => ({ ...f, emergencySurcharge: value }));
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <p className="text-label text-ink-3">
                      <span className="font-medium text-ink-2">
                        Tell the caller after booking an after-hours emergency.
                      </span>{" "}
                      Scout never brings it up on its own. Asked before then, it says the office
                      will confirm the price.
                    </p>
                    <PhoneSwitch
                      label="Tell the caller after booking an after-hours emergency"
                      on={callHandlerForm.mentionSurcharge}
                      onToggle={() =>
                        updateCallHandlerField(
                          "mentionSurcharge",
                          !callHandlerForm.mentionSurcharge,
                        )
                      }
                    />
                  </div>
                </div>
              </PhoneGroup>

              <PhoneGroup title="When a caller asks for a person">
                <div
                  role="radiogroup"
                  aria-label="When a caller asks for a person"
                  className="space-y-2"
                >
                  {(
                    [
                      {
                        mode: "sms",
                        title: "Take a message and text me",
                        detail: "Scout takes the caller’s details and texts them to you.",
                      },
                      {
                        mode: "transfer",
                        title: "Put them through to a number you choose",
                        detail: "During business hours only. After hours, Scout takes a message.",
                      },
                    ] as const
                  ).map((option) => {
                    const selected = escalationForm.mode === option.mode;
                    return (
                      <label
                        key={option.mode}
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 transition-colors ${selected ? "bg-terracotta-tint" : "bg-paper-2 hover:bg-tan-soft/60"}`}
                      >
                        <input
                          type="radio"
                          name="handoff"
                          value={option.mode}
                          checked={selected}
                          onChange={() => chooseHandoff(option.mode)}
                          className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-deep"
                        />
                        <div>
                          <p className="text-body font-medium text-ink">{option.title}</p>
                          <p className="text-label text-ink-3">{option.detail}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {escalationForm.mode === "transfer" && (
                  <div className="rounded-2xl bg-paper-2 px-4 py-3.5">
                    <label
                      htmlFor="transfer-number"
                      className="mb-1.5 block text-label font-medium text-ink-2"
                    >
                      Transfer calls to
                    </label>
                    <input
                      id="transfer-number"
                      type="tel"
                      value={escalationForm.transferNumber}
                      onChange={(e) => updateEscalation({ transferNumber: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="field w-full max-w-xs py-2"
                    />
                    {transferLoopsBack() ? (
                      <p role="alert" className="mt-2 text-label text-terracotta-deep">
                        That is your main line. If it forwards calls to Scout, the caller lands back
                        on Scout. Use a direct line or a cell phone instead.
                      </p>
                    ) : null}
                  </div>
                )}
              </PhoneGroup>

              <PhoneGroup
                title="Texts to you"
                aside={
                  <span className="text-label text-ink-3">
                    {savedEscalation.ownerPhone
                      ? `Going to ${formatPhone(savedEscalation.ownerPhone)} `
                      : "No alerts number yet "}
                    <button
                      type="button"
                      onClick={() => setActiveTab("overview")}
                      className="font-medium text-terracotta-deep underline underline-offset-2"
                    >
                      {savedEscalation.ownerPhone ? "Change alerts number" : "Set alerts number"}
                    </button>
                  </span>
                }
              >
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-paper-2 px-4 py-3.5">
                  <div>
                    <p className="text-body font-medium text-ink">When a caller needs a person</p>
                    <p className="text-label text-ink-3">Always, during your business hours.</p>
                  </div>
                  <span className="shrink-0 text-label font-medium text-ink-3">Always on</span>
                </div>

                <SwitchRow
                  title="Text me after hours too"
                  detail="When a caller needs a person outside your hours. Off: it waits on your dashboard until morning."
                  on={escalationForm.afterHoursOwnerAlerts}
                  onToggle={() =>
                    updateEscalation({
                      afterHoursOwnerAlerts: !escalationForm.afterHoursOwnerAlerts,
                    })
                  }
                />
                <SwitchRow
                  title="When Scout books a job"
                  detail={
                    '"Scout booked Sam - repair, Tuesday 8-10 AM, 120 Elm St." Sent any hour.'
                  }
                  on={notificationsForm.textOnBooking}
                  onToggle={() => toggleNotification("textOnBooking")}
                />
                <SwitchRow
                  title="A summary after every call"
                  detail="One line about each call, the moment it ends. Sent any hour."
                  on={notificationsForm.textAfterCall}
                  onToggle={() => toggleNotification("textAfterCall")}
                />
                <div className="rounded-2xl bg-paper-2 px-4 py-3.5">
                  <label
                    htmlFor="also-text"
                    className="mb-1.5 block text-body font-medium text-ink-2"
                  >
                    Also text when a caller needs a person
                  </label>
                  <input
                    id="also-text"
                    type="text"
                    value={additionalPhonesDraft}
                    onChange={(e) => {
                      setAdditionalPhonesDraft(e.target.value);
                      updateEscalation({
                        additionalPhones: e.target.value
                          .split(",")
                          .map((p) => p.trim())
                          .filter(Boolean),
                      });
                    }}
                    placeholder="(555) 555-0101, (555) 555-0102"
                    className="field w-full py-2"
                  />
                  <p className="mt-1 text-label text-ink-4">
                    An office manager or a lead tech - up to 5 numbers, separated by commas. They
                    get these texts only, not booking texts or call summaries.
                  </p>
                </div>
              </PhoneGroup>

              <PhoneGroup title="Texts to others">
                <SwitchRow
                  title="Text the customer their appointment"
                  detail={
                    <>
                      &ldquo;Hi Sam, you&rsquo;re booked Tuesday 8-10 AM with Dave. We&rsquo;ll see
                      you then.&rdquo; Turn this off if your CRM already texts customers when a job
                      is booked, or they will get two.
                      {notificationsForm.twoWaySchedulingTexts
                        ? " Two-way scheduling texts (under Advanced) still send it, so customers have a number to reply to."
                        : ""}
                    </>
                  }
                  on={notificationsForm.textCustomerOnBooking}
                  onToggle={() => toggleNotification("textCustomerOnBooking")}
                />
                <SwitchRow
                  title="Text the assigned tech the job details"
                  detail="Sent to the technician on the job, at the mobile number on their CRM profile, the moment the booking lands - any hour."
                  on={notificationsForm.textTechOnBooking}
                  onToggle={() => toggleNotification("textTechOnBooking")}
                />
              </PhoneGroup>

              <section className="rounded-2xl border border-tan-soft">
                <button
                  type="button"
                  aria-expanded={advancedOpen}
                  aria-controls="phone-advanced"
                  onClick={() => setAdvancedOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="text-body font-semibold text-ink">
                    Advanced - set up with your Scout team
                  </span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-ink-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {advancedOpen && (
                  <div id="phone-advanced" className="space-y-6 px-4 pb-4">
                    <div>
                      <p className="mb-1.5 text-body font-medium text-ink-2">Speaking style</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {TONE_OPTIONS.map((tone) => {
                          const selected = callHandlerForm.tone === tone.id;
                          return (
                            <label
                              key={tone.id}
                              className={`flex cursor-pointer items-start gap-2 rounded-2xl px-4 py-3 transition-colors ${selected ? "bg-terracotta-tint" : "bg-paper-2 hover:bg-tan-soft/60"}`}
                            >
                              <input
                                type="radio"
                                name="tone"
                                value={tone.id}
                                checked={selected}
                                onChange={() => updateCallHandlerField("tone", tone.id)}
                                className="mt-0.5 h-4 w-4 text-terracotta-deep"
                              />
                              <div>
                                <p className="text-body font-medium text-ink">{tone.label}</p>
                                <p className="text-label text-ink-3">{tone.hint}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-label text-ink-4">
                        Scout&rsquo;s phone voice was tuned and tested on Friendly.
                      </p>
                    </div>

                    <div>
                      <p className="mb-1.5 text-body font-medium text-ink-2">Phone AI model</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          ...MODEL_OPTIONS,
                          ...(callHandlerForm.model === "gpt-4.1" ||
                          callHandlerForm.model === "gpt-5.6-sol"
                            ? [
                                {
                                  id: callHandlerForm.model,
                                  label: "Advanced (previous)",
                                  hint: "Your existing voice model. Select Advanced to upgrade.",
                                },
                              ]
                            : []),
                        ].map((model) => {
                          const selected = (callHandlerForm.model ?? "gpt-4.1-mini") === model.id;
                          return (
                            <label
                              key={model.id}
                              className={`flex cursor-pointer items-start gap-2 rounded-2xl px-4 py-3 transition-colors ${selected ? "bg-terracotta-tint" : "bg-paper-2 hover:bg-tan-soft/60"}`}
                            >
                              <input
                                type="radio"
                                name="voice-model"
                                value={model.id}
                                checked={selected}
                                onChange={() => updateCallHandlerField("model", model.id)}
                                className="mt-0.5 h-4 w-4 text-terracotta-deep"
                              />
                              <div>
                                <p className="text-body font-medium text-ink">{model.label}</p>
                                <p className="text-label text-ink-3">{model.hint}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="transfer-message"
                        className="mb-1.5 block text-body font-medium text-ink-2"
                      >
                        Transfer line
                      </label>
                      <input
                        id="transfer-message"
                        type="text"
                        maxLength={200}
                        value={escalationForm.transferMessage}
                        onChange={(e) => updateEscalation({ transferMessage: e.target.value })}
                        placeholder="Okay, connecting you to our team now - one moment."
                        className="field w-full py-2"
                      />
                      <p className="mt-1.5 text-label text-ink-4">
                        Spoken right before Scout puts a caller through. Leave blank for the
                        standard line.
                      </p>
                    </div>

                    <SwitchRow
                      title="Let customers change voice bookings by text"
                      detail="Scout texts after booking a visit on a call. Customers can reply to move or cancel that visit, and Scout checks the CRM before confirming the change. If the CRM can't safely make the change, Scout routes it to your office. This doesn't turn on campaigns or text appointments booked elsewhere."
                      on={notificationsForm.twoWaySchedulingTexts}
                      onToggle={() => toggleNotification("twoWaySchedulingTexts")}
                    />

                    <dl className="space-y-1 text-label text-ink-3">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-ink-2">Tuned voice</dt>
                        <dd>{tunedVoiceNote()}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-ink-2">Prompt style</dt>
                        <dd>{promptStyle}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </section>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="primary"
                  size="md"
                  pill
                  icon={
                    savingCallHandler ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )
                  }
                  onClick={() => void saveCallHandlerSettings()}
                  disabled={
                    (!Object.values(phoneSavePlan()).some(Boolean) && !pushOwed) ||
                    !bookingWindowsCheck.ok ||
                    savingCallHandler ||
                    pushingSave
                  }
                >
                  Save changes
                </Button>
              </div>
            </div>
          )}

          {activeTab === "knowledge" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 sm:pr-10">
                <div>
                  <h2 className="text-title font-semibold text-ink">Knowledge Base</h2>
                  <span className="text-label text-ink-4">
                    {knowledge.length} {knowledge.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  pill
                  icon={<Plus size={16} />}
                  onClick={openAddKnowledge}
                >
                  Add Entry
                </Button>
              </div>
              <p className="text-body text-ink-3">
                Information Scout has learned about your business. These entries help the AI provide
                accurate answers to customers and make better decisions.
              </p>
              <div className="space-y-3">
                {knowledge.map((entry) => (
                  <div key={entry.id} className="rounded-2xl bg-paper-2 p-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <h3 className="text-body font-semibold text-ink">{entry.topic}</h3>
                      <div className="flex items-center gap-2">
                        {knowledgeSavedLabel(entry.savedAt, clock) ? (
                          <time
                            dateTime={entry.savedAt}
                            className="text-label whitespace-nowrap text-ink-4"
                          >
                            {knowledgeSavedLabel(entry.savedAt, clock)}
                          </time>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="Edit"
                          title="Edit"
                          icon={<Pencil size={16} />}
                          onClick={() => openEditKnowledge(entry)}
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          iconOnly
                          aria-label="Delete"
                          title="Delete"
                          icon={<Trash2 size={16} />}
                          onClick={() => void deleteKnowledge(entry.id)}
                          disabled={pushingSave}
                        />
                      </div>
                    </div>
                    <p className="text-body leading-relaxed text-ink-2">{entry.content}</p>
                  </div>
                ))}
                {knowledge.length === 0 && (
                  <p className="py-8 text-center text-body text-ink-4">
                    No knowledge entries yet. Add information that helps Scout understand your
                    business.
                  </p>
                )}
              </div>

              <div className="pt-2">
                <ShopNumbersSection trade={company?.trade} />
              </div>

              <Modal
                open={knowledgeModalOpen}
                onClose={() => setKnowledgeModalOpen(false)}
                title={editingKnowledge ? "Edit Knowledge Entry" : "Add Knowledge Entry"}
              >
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-body font-medium text-ink-2">Topic</label>
                    <input
                      type="text"
                      value={knowledgeForm.topic}
                      onChange={(e) =>
                        setKnowledgeForm({ ...knowledgeForm, topic: e.target.value })
                      }
                      placeholder="e.g., Warranty Process, Emergency Protocol"
                      className="field w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-body font-medium text-ink-2">Content</label>
                    <textarea
                      value={knowledgeForm.content}
                      onChange={(e) =>
                        setKnowledgeForm({ ...knowledgeForm, content: e.target.value })
                      }
                      placeholder="What should Scout know about this topic?"
                      rows={4}
                      className="field-warm"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => setKnowledgeModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      pill
                      icon={
                        saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />
                      }
                      onClick={() => void saveKnowledge()}
                      disabled={
                        saving ||
                        pushingSave ||
                        !knowledgeForm.topic.trim() ||
                        !knowledgeForm.content.trim()
                      }
                    >
                      {editingKnowledge ? "Update" : "Add"} Entry
                    </Button>
                  </div>
                </div>
              </Modal>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
