"use client";
import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DarkModeToggle from "@/components/dark-mode-toggle";
import MobileMenu from "@/components/mobile-menu";
import ScoutValueChip from "@/components/scout-value";
import Wordmark from "@/components/wordmark";
import { useSettingsStore } from "@/lib/settings-store";
export default function TopStrip({
  companyName = "",
  isTech = false,
  speedToLead = false,
}: {
  companyName?: string;
  isTech?: boolean;
  speedToLead?: boolean;
}) {
  const pathname = usePathname();
  const openSettings = useSettingsStore((s) => s.openSettings);
  if (pathname === "/login" || pathname === "/tech/login") return null;
  return (
    <header className="mobile-top-strip pointer-events-none fixed inset-x-0 top-0 z-40 flex h-[calc(4rem+var(--safe-t))] items-center justify-between px-[calc(1rem+var(--safe-l))] pt-[var(--safe-t)] sm:px-7">
      <div className="pointer-events-auto flex items-center gap-3">
        {!isTech && <MobileMenu speedToLead={speedToLead} />}

        <Link href={isTech ? "/tech" : "/"} aria-label="Scout home">
          <Wordmark size="md" interactive />
        </Link>
      </div>
      <div className="pointer-events-auto flex items-center gap-3">
        {!isTech && <ScoutValueChip placement="strip" />}
        {companyName.length > 0 && (
          <span className="hidden text-label font-semibold tracking-wide text-ink-2 sm:block">
            {companyName}
          </span>
        )}
        {!isTech && (
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => openSettings()}
            className="chrome-button flex items-center justify-center text-ink-2 hover:text-ink"
          >
            <Settings size={19} strokeWidth={1.8} />
          </button>
        )}
        <DarkModeToggle />
      </div>
    </header>
  );
}
