import { create } from "zustand";
const STORAGE_KEY = "scout-buddy-v1";
type Preferences = {
  enabled: boolean;
  tips: boolean;
};
const defaults: Preferences = { enabled: true, tips: false };
type BuddyState = Preferences & {
  ready: boolean;
  tipShown: boolean;
  reviewCount: number;
  reviewKey: string;
  reviewSeenKey: string;
  reviewOpen: boolean;
  welcome: boolean;
  hydrate: () => void;
  setPreference: (key: keyof Preferences, value: boolean) => void;
  markTipShown: () => void;
  setReview: (count: number, key: string) => void;
  setReviewOpen: (open: boolean) => void;
  setWelcome: (welcome: boolean) => void;
};
export const useBuddyStore = create<BuddyState>((set, get) => ({
  ...defaults,
  ready: false,
  tipShown: false,
  reviewCount: 0,
  reviewKey: "",
  reviewSeenKey: "",
  reviewOpen: false,
  welcome: false,
  hydrate: () => {
    if (get().ready) {
      return;
    }
    let preferences = defaults;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && typeof saved === "object" && "enabled" in saved && "tips" in saved) {
        if (typeof saved.enabled === "boolean" && typeof saved.tips === "boolean") {
          preferences = { enabled: saved.enabled, tips: saved.tips };
        }
      }
    } catch {}
    set({ ...preferences, ready: true });
  },
  setPreference: (key, value) => {
    set({ [key]: value });
    const { enabled, tips } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, tips }));
    } catch {}
  },
  markTipShown: () => set({ tipShown: true }),
  setReview: (reviewCount, reviewKey) => set({ reviewCount, reviewKey }),
  setReviewOpen: (reviewOpen) => set({ reviewOpen, reviewSeenKey: get().reviewKey }),
  setWelcome: (welcome) => set({ welcome }),
}));
