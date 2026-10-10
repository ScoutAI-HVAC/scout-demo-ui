"use client";
import { createContext, useContext, type ReactNode } from "react";
import { formatPhone } from "@/lib/format";
const PhonePrivacy = createContext(false);
const HIDDEN_PHONE = "••• ••• ••••";
export function maskPhoneText(text: string, streaming = false): string {
  const masked = text.replace(
    /(?<![\w$])(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\w)/g,
    HIDDEN_PHONE,
  );
  return streaming
    ? masked.replace(/(?<![\w$])(?:\+?1[ .-]?)?\(?\d{3}[)\d .-]*$/, HIDDEN_PHONE)
    : masked;
}
export function CampaignPhonePrivacyProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <PhonePrivacy.Provider value={enabled}>{children}</PhonePrivacy.Provider>;
}
export function useCampaignPhonePrivacy() {
  const enabled = useContext(PhonePrivacy);
  return {
    displayPhone: (phone?: string | null) => (enabled && phone ? HIDDEN_PHONE : formatPhone(phone)),
    displayText: (text: string, streaming = false) =>
      enabled ? maskPhoneText(text, streaming) : text,
  };
}
