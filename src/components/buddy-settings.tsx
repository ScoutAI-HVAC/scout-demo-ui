"use client";
import { useEffect } from "react";
import { useBuddyStore } from "@/lib/buddy-store";
import ScoutMascot from "./scout-mascot";
export default function BuddySettings() {
  const { enabled, tips, ready, hydrate, setPreference } = useBuddyStore();
  useEffect(() => hydrate(), [hydrate]);
  return (
    <section aria-labelledby="buddy-settings-title" className="rounded-2xl bg-paper-2 p-5">
      <div className="mb-3 flex items-center gap-4">
        <ScoutMascot className="h-16 w-14 shrink-0" />
        <div>
          <h3 id="buddy-settings-title" className="text-body font-semibold text-ink">
            A little company
          </h3>
          <p className="mt-1 text-label text-ink-3">
            A little face at your chat bar. Here when you want him.
          </p>
        </div>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 text-body text-ink">
        Show Scout buddy
        <input
          type="checkbox"
          checked={enabled}
          disabled={!ready}
          onChange={(e) => setPreference("enabled", e.target.checked)}
          className="h-5 w-5 accent-terracotta"
        />
      </label>
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 text-body text-ink">
        Occasional helpful tips
        <input
          type="checkbox"
          checked={tips}
          disabled={!ready || !enabled}
          onChange={(e) => setPreference("tips", e.target.checked)}
          className="h-5 w-5 accent-terracotta disabled:opacity-40"
        />
      </label>
      <p className="mt-2 text-label leading-relaxed text-ink-3">
        Saved on this browser. No messages are sent by the buddy. Motion follows your device’s
        reduced-motion setting.
      </p>
    </section>
  );
}
