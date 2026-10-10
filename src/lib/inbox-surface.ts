export type InboxSurfaceArea = "messages" | "customer" | "speed-to-lead";
const SURFACE = /^(messages|customer|speed-to-lead):(phone|desktop)$/;
export function inboxSurface(area: InboxSurfaceArea): string {
  const phone =
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches === true;
  return `${area}:${phone ? "phone" : "desktop"}`;
}
export function cleanInboxSurface(raw: unknown): string {
  return typeof raw === "string" && SURFACE.test(raw) ? raw : "dashboard";
}
export function inboxActor(authEnabled: boolean): string {
  return authEnabled ? "owner" : "dashboard-no-login";
}
