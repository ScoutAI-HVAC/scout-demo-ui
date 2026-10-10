"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_COLORS, THEME_STORAGE_KEY } from "@/lib/theme";
export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    setMounted(true);
    const sync = () => {
      const dark = document.documentElement.classList.contains("dark");
      setIsDark(dark);
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
        meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light;
      });
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.head, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {}
  }
  if (!mounted) {
    return (
      <button
        aria-label="Toggle dark mode"
        className="chrome-button flex items-center justify-center text-ink-2"
      >
        <Moon size={18} strokeWidth={1.8} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="chrome-button flex items-center justify-center text-ink-2 hover:text-ink"
    >
      {isDark ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
    </button>
  );
}
