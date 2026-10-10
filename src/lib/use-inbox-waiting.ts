"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchInboxList, INBOX_WAITING_EVENT, waitingOnYou } from "@/app/inbox/inbox-list";
export function useInboxWaitingCount(enabled: boolean): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const body = await fetchInboxList();
        if (!cancelled) setCount((body.conversations ?? []).filter(waitingOnYou).length);
      } catch {}
    };
    const onCount = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "number" && Number.isFinite(detail) && detail >= 0) setCount(detail);
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    window.addEventListener(INBOX_WAITING_EVENT, onCount);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(INBOX_WAITING_EVENT, onCount);
    };
  }, [pathname, enabled]);
  return count;
}
