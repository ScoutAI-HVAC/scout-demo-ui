"use client";
import { Banknote, MessageSquare, Phone, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ScoutMark from "@/components/scout-mark";
import { phoneKeyboardOpen } from "@/lib/phone-keyboard";
interface DockItem {
  href: string;
  label: string;
  icon: LucideIcon | typeof ScoutMark;
  center?: boolean;
}
const ITEMS: DockItem[] = [
  { href: "/calls", label: "Phone", icon: Phone },
  { href: "/chat", label: "Chat", icon: ScoutMark, center: true },
  { href: "/inbox", label: "Messaging", icon: MessageSquare },
  { href: "/flows", label: "Campaigns", icon: Banknote },
];
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
export const CONSOLE_SLOT_ID = "scout-console-slot";
export function setDockClearance(host: HTMLElement, clearance: string | null): void {
  const root = document.documentElement;
  const before = root.scrollHeight;
  const following =
    before > window.innerHeight + 2 && before - window.scrollY - window.innerHeight < 2;
  if (clearance === null) {
    host.style.removeProperty("--dock-clearance");
  } else {
    host.style.setProperty("--dock-clearance", clearance);
  }
  const grew = root.scrollHeight - before;
  if (following && grew > 0) {
    window.scrollBy(0, grew);
  }
}
export default function Dock({
  attentionCount = 0,
  speedToLead = false,
}: {
  attentionCount?: number;
  speedToLead?: boolean;
}) {
  const items: DockItem[] = speedToLead
    ? [...ITEMS, { href: "/speed-to-lead", label: "Leads", icon: Zap }]
    : ITEMS;
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const publishRef = useRef<() => void>(() => {});
  const [puck, setPuck] = useState<{
    left: number;
    width: number;
  } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const shell = shellRef.current;
    if (!vv || !shell) return;
    function sync() {
      if (!vv || !shell) return;
      const lifted = shell.style.top !== "";
      const lift = shell.contains(document.activeElement) && phoneKeyboardOpen(vv);
      shell.style.top = lift ? `${vv.offsetTop + vv.height - shell.offsetHeight - 8}px` : "";
      shell.style.bottom = lift ? "auto" : "";
      if (lifted && !lift) publishRef.current();
    }
    const observer = new ResizeObserver(sync);
    observer.observe(shell);
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      observer.disconnect();
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    function move() {
      const active = nav?.querySelector<HTMLElement>("[data-active='true']");
      if (!active) {
        setPuck(null);
        return;
      }
      setPuck({ left: active.offsetLeft, width: active.offsetWidth });
    }
    move();
    const observer = new ResizeObserver(move);
    observer.observe(nav);
    window.addEventListener("resize", move);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", move);
    };
  }, [pathname]);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    function publish() {
      if (!shell) return;
      const height = Math.ceil(shell.getBoundingClientRect().height);
      if (height < 10) {
        setDockClearance(
          document.documentElement,
          window.matchMedia("(max-width: 639px)").matches ? "24px" : null,
        );
        return;
      }
      const safeBottom = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--safe-b"),
      );
      const safe = Number.isFinite(safeBottom) ? safeBottom : 0;
      const clearance = height + 24 + 16 + safe;
      const current = Number.parseFloat(
        document.documentElement.style.getPropertyValue("--dock-clearance"),
      );
      if (shell.style.top !== "" && clearance < current) {
        return;
      }
      setDockClearance(document.documentElement, `${clearance}px`);
    }
    publishRef.current = publish;
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(shell);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--dock-clearance");
    };
  }, [pathname]);
  if (pathname === "/login" || pathname === "/tech/login") return null;
  return (
    <div
      ref={shellRef}
      data-composer-page={pathname === "/chat"}
      className="dock-shell fixed bottom-[calc(1.5rem+var(--safe-b))] left-1/2 z-50 w-fit -translate-x-1/2 rounded-[26px] p-2 transition-[left,width,height] duration-200 sm:left-[calc(50%+var(--shell-rail,0px)/2)]"
    >
      <div id={CONSOLE_SLOT_ID} className="empty:hidden" />
      <nav
        ref={navRef}
        aria-label="Sections"
        className="relative flex items-center justify-center gap-1.5"
      >
        {puck && (
          <span
            aria-hidden
            className="dock-puck absolute top-0 bottom-0 z-0 rounded-pill"
            style={{ left: puck.left, width: puck.width }}
          />
        )}
        {items.map(({ href, label, icon: Icon, center }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              data-active={active}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 flex flex-col items-center gap-1 rounded-pill font-semibold transition-colors ${
                center
                  ? "px-3 py-3 text-[12px] sm:px-8 sm:py-3.5"
                  : "px-2 py-2.5 text-[11.5px] sm:px-6 sm:py-3"
              } ${active ? "text-terracotta-deep" : "text-ink-3 hover:text-ink"}`}
            >
              {center ? <Icon size={24} /> : <Icon size={21} strokeWidth={2} />}
              {label}
              {href === "/calls" && attentionCount > 0 && (
                <span className="absolute right-3 top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-pill bg-alarm px-1 text-[10px] font-bold text-on-accent shadow-soft">
                  {attentionCount > 9 ? "9+" : attentionCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
