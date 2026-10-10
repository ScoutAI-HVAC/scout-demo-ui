"use client";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import SettingsPanel from "@/components/settings-panel";
import { useSettingsStore } from "@/lib/settings-store";
export default function SettingsModal({ speedToLead = false }: { speedToLead?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const open = useSettingsStore((s) => s.open);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("meta_connection")) {
      useSettingsStore.getState().openSettings("meta");
    }
    if (url.searchParams.has("google_lsa")) {
      useSettingsStore.getState().openSettings("google-lsa");
    }
  }, []);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const nested = panelRef.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (e.key === "Escape" && !nested) {
        closeSettings();
      }
      if (e.key !== "Tab") {
        return;
      }
      const scope = nested ?? panelRef.current;
      const controls = Array.from(
        scope?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        last?.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousFocus?.focus();
    };
  }, [open, closeSettings]);
  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <button
        type="button"
        aria-label="Close settings"
        onClick={closeSettings}
        className="animate-backdropFade absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="settings-sheet quiet-focus relative flex h-[calc(100dvh-var(--safe-t)-0.75rem)] w-full max-w-[1360px] flex-col overflow-hidden rounded-t-[28px] bg-paper shadow-lift sm:h-[min(54rem,90dvh)] sm:rounded-[28px]"
      >
        <div className="flex min-h-[4.25rem] shrink-0 items-center pr-16 pl-5 sm:hidden">
          <h2 className="font-display text-h1 font-medium text-ink">Settings</h2>
        </div>
        <button
          type="button"
          onClick={closeSettings}
          aria-label="Close"
          className="chrome-button absolute top-3 right-3 z-10 flex items-center justify-center text-ink-2 hover:text-ink"
        >
          <X size={20} strokeWidth={1.8} />
        </button>

        <SettingsPanel speedToLead={speedToLead} />
      </div>
    </div>
  );
}
