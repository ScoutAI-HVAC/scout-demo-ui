import { create } from "zustand";
export type SettingsSection =
  | "overview"
  | "company"
  | "techs"
  | "services"
  | "integrations"
  | "google-lsa"
  | "meta"
  | "crm"
  | "booking"
  | "call-handler"
  | "knowledge";
interface SettingsState {
  open: boolean;
  section: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  setSection: (section: SettingsSection) => void;
}
export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  section: "overview",
  openSettings: (section) => set(section ? { open: true, section } : { open: true }),
  closeSettings: () => set({ open: false }),
  setSection: (section) => set({ section }),
}));
