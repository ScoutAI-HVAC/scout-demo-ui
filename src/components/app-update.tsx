"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import {
  bundleBuildId,
  CHECK_INTERVAL_MS,
  claimReload,
  fetchServerBuildId,
  FOREGROUND_RECHECK_MS,
  noteTyping,
  reloadBlocker,
} from "@/lib/app-update";
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
const reloadPage = () => window.location.reload();
export default function AppUpdate({ reload = reloadPage }: { reload?: () => void }) {
  const pathname = usePathname();
  const newer = useRef<string | null>(null);
  const lastCheckAt = useRef(0);
  const reloadIfSafe = useCallback(() => {
    const target = newer.current;
    const storage = tabStorage();
    if (!target || !storage || reloadBlocker() !== null) {
      return;
    }
    if (claimReload(target, storage)) {
      reload();
    }
  }, [reload]);
  const check = useCallback(async () => {
    lastCheckAt.current = Date.now();
    const id = await fetchServerBuildId();
    if (id && id !== bundleBuildId()) {
      newer.current = id;
    }
  }, []);
  useEffect(() => {
    if (!bundleBuildId()) {
      return;
    }
    const onInput = (event: Event) => noteTyping(event.target);
    const onForeground = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastCheckAt.current < FOREGROUND_RECHECK_MS) {
        reloadIfSafe();
        return;
      }
      void check().then(reloadIfSafe);
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void check();
      }
    }, CHECK_INTERVAL_MS);
    document.addEventListener("input", onInput, true);
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("pageshow", onForeground);
    void check();
    return () => {
      clearInterval(timer);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("pageshow", onForeground);
    };
  }, [check, reloadIfSafe]);
  const shownPath = useRef(pathname);
  useEffect(() => {
    if (shownPath.current === pathname) {
      return;
    }
    shownPath.current = pathname;
    reloadIfSafe();
  }, [pathname, reloadIfSafe]);
  return null;
}
