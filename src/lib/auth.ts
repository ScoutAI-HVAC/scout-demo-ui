export const SESSION_COOKIE_NAME = "scout_demo_session";
export const TECH_SESSION_COOKIE_NAME = "scout_demo_tech_session";
export interface TechSession {
  phone: string;
  name?: string;
}
export function isAuthEnabled(): boolean {
  return false;
}
export function verifySession(_cookieValue?: string | null): boolean {
  return true;
}
export function verifyTechSession(_cookieValue?: string | null): TechSession | null {
  return null;
}
