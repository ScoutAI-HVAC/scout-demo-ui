"use client";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { needsYouLabel } from "@/app/inbox/inbox-list";
import DarkModeToggle from "@/components/dark-mode-toggle";
import ScoutBrandMark from "@/components/scout-brand-mark";
import ScoutValueChip from "@/components/scout-value";
import Wordmark from "@/components/wordmark";
import { workspaceNav } from "@/components/workspace-nav";
import { useSettingsStore } from "@/lib/settings-store";
import { useInboxWaitingCount } from "@/lib/use-inbox-waiting";
const STORAGE_KEY = "scout-side-dock";
const OPEN_PX = 236;
const CLOSED_PX = 68;
export const SIDEBAR_CHATS_SLOT_ID = "scout-sidebar-chats-slot";
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
export default function SideDock({
  companyName = "",
  speedToLead = false,
}: {
  companyName?: string;
  speedToLead?: boolean;
}) {
  const pathname = usePathname();
  const hidden =
    pathname === "/login" || pathname === "/tech/login" || pathname.startsWith("/tech");
  const openSettings = useSettingsStore((s) => s.openSettings);
  const [open, setOpen] = useState(true);
  const waiting = useInboxWaitingCount(!hidden);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "closed") setOpen(false);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
    } catch {}
  }, [open]);
  useEffect(() => {
    const mq = window.matchMedia?.("(min-width: 640px)");
    const applyVar = () => {
      if (mq?.matches !== false) {
        document.documentElement.style.setProperty(
          "--shell-left",
          `${open ? OPEN_PX : CLOSED_PX}px`,
        );
      } else {
        document.documentElement.style.removeProperty("--shell-left");
      }
    };
    applyVar();
    mq?.addEventListener?.("change", applyVar);
    return () => {
      mq?.removeEventListener?.("change", applyVar);
      document.documentElement.style.removeProperty("--shell-left");
    };
  }, [open]);
  if (hidden) {
    return null;
  }
  const onChat = isActive(pathname, "/chat");
  return (
    <aside
      aria-label="Navigation"
      className="fixed inset-y-0 left-0 z-40 hidden flex-col rounded-r-[28px] bg-paper-2 transition-[width] duration-200 sm:flex"
      style={{ width: open ? OPEN_PX : CLOSED_PX }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Collapse navigation" : "Open navigation"}
        aria-expanded={open}
        className="absolute top-8 -right-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-paper text-ink-2 shadow-card transition-transform hover:scale-110 hover:text-ink"
      >
        {open ? (
          <ChevronLeft size={15} strokeWidth={2} />
        ) : (
          <ChevronRight size={15} strokeWidth={2} />
        )}
      </button>

      <Link
        href="/chat"
        aria-label="Scout home"
        className={`flex items-center gap-2 pt-6 pb-4 ${open ? "px-5" : "justify-center px-0"}`}
      >
        {open ? <Wordmark size="md" interactive /> : <ScoutBrandMark />}
      </Link>

      <ScoutValueChip placement={open ? "rail" : "rail-collapsed"} />

      <nav className={`flex flex-col gap-1.5 ${open ? "px-4" : "items-center px-2"}`}>
        {workspaceNav(speedToLead).map((nav) => {
          const active = isActive(pathname, nav.href);
          const Icon = nav.icon;
          const badge =
            nav.href === "/inbox" && waiting > 0 ? (
              <span
                aria-label={needsYouLabel(waiting)}
                className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-ink px-1 text-[10px] font-bold text-paper ${open ? "" : "absolute -top-1 -right-1"}`}
              >
                {waiting > 9 ? "9+" : waiting}
              </span>
            ) : null;
          return (
            <Link
              key={nav.href}
              href={nav.href}
              aria-current={active ? "page" : undefined}
              title={open ? undefined : nav.label}
              className={`relative flex items-center gap-3 rounded-pill text-body font-semibold transition-colors ${open ? "px-4 py-2.5" : "h-11 w-11 justify-center"} ${active ? "bg-terracotta-tint text-ink" : "text-ink-2 hover:bg-paper hover:text-ink"}`}
            >
              <Icon size={19} strokeWidth={1.8} />
              {open && <span className="min-w-0 flex-1 truncate">{nav.label}</span>}
              {badge}
            </Link>
          );
        })}
      </nav>

      {onChat && open ? (
        <div className="mx-3 mt-4 flex min-h-0 flex-1 flex-col overflow-hidden pt-1">
          <div id={SIDEBAR_CHATS_SLOT_ID} className="flex min-h-0 flex-1 flex-col" />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div
        className={`flex items-center gap-2 pt-4 pb-5 ${open ? "px-5" : "flex-col justify-center px-0"}`}
      >
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => openSettings()}
          className="chrome-button flex items-center justify-center text-ink-2 hover:text-ink"
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
        <span className="rounded-full [&_button]:rounded-full [&_button]:border-0">
          <DarkModeToggle />
        </span>
        {open && companyName.length > 0 && (
          <span className="min-w-0 flex-1 truncate text-right text-label font-medium text-ink-2">
            {companyName}
          </span>
        )}
      </div>
    </aside>
  );
}
