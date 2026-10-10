"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { phoneKeyboardOpen } from "@/lib/phone-keyboard";
export default function MobileConversation({
  active,
  className,
  children,
}: {
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const media = window.matchMedia("(max-width: 639px)");
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    function sync() {
      if (!panel) return;
      if (!media.matches) {
        root.style.overflow = previousOverflow;
        panel.removeAttribute("data-keyboard");
        panel.removeAttribute("data-compact");
        return;
      }
      root.style.overflow = "hidden";
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const keyboard = panel.contains(document.activeElement) && phoneKeyboardOpen({ height });
      const compact = height < 500;
      const headerHeight =
        document.querySelector(".mobile-top-strip")?.getBoundingClientRect().height ?? 64;
      const header = compact ? Math.max(0, headerHeight - 64) : headerHeight;
      const dock = document.querySelector(".dock-shell")?.getBoundingClientRect();
      const safeBottom =
        Number.parseFloat(getComputedStyle(root).getPropertyValue("--safe-b")) || 0;
      const footer =
        keyboard || compact
          ? 8
          : dock && dock.height > 0
            ? window.innerHeight - dock.top + 8
            : safeBottom + 8;
      panel.dataset.keyboard = String(keyboard);
      panel.dataset.compact = String(compact);
      panel.style.setProperty("--conversation-top", `${top + header}px`);
      panel.style.setProperty(
        "--conversation-height",
        `${Math.max(0, height - header - footer)}px`,
      );
    }
    sync();
    const observer = new ResizeObserver(sync);
    const dock = document.querySelector(".dock-shell");
    if (dock) observer.observe(dock);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    media.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
      media.removeEventListener("change", sync);
      root.style.overflow = previousOverflow;
    };
  }, [active]);
  return (
    <div ref={ref} className={`${active ? "mobile-conversation " : ""}${className}`}>
      {children}
    </div>
  );
}
