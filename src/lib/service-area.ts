export type ServiceAreaMode = "radius" | "list";
export interface ServiceAreaSettings {
  mode: ServiceAreaMode;
  radiusMiles: number;
  centerAddress: string;
  locations: string[];
  notes: string;
}
export interface ServiceAreaCompanyConfig {
  serviceArea?: unknown;
  serviceAreaList?: unknown;
  serviceAreaMode?: unknown;
  serviceAreaRadiusMiles?: unknown;
  serviceAreaCenterAddress?: unknown;
  serviceAreaNotes?: unknown;
}
const DEFAULT_RADIUS_MILES = 30;
const RADIUS_PATTERN = /\b(\d{1,3})\s*(?:-|\s)?mile\s+radius\b/i;
export function normalizeServiceAreaLocations(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : [];
  return [...new Set(raw.map((entry) => String(entry).trim()).filter(Boolean))];
}
export function serviceAreaFromCompanyConfig(
  company: ServiceAreaCompanyConfig | null | undefined,
): ServiceAreaSettings {
  const activeLocations = normalizeServiceAreaLocations(company?.serviceArea);
  const savedLocations = normalizeServiceAreaLocations(company?.serviceAreaList);
  const notes =
    typeof company?.serviceAreaNotes === "string" ? company.serviceAreaNotes.trim() : "";
  const legacyRadiusText = [...activeLocations, notes].find((entry) => RADIUS_PATTERN.test(entry));
  const explicitRadius = Number(company?.serviceAreaRadiusMiles);
  const legacyRadius = legacyRadiusText?.match(RADIUS_PATTERN)?.[1];
  const radiusMiles =
    Number.isFinite(explicitRadius) && explicitRadius > 0
      ? Math.round(explicitRadius)
      : legacyRadius
        ? Number(legacyRadius)
        : DEFAULT_RADIUS_MILES;
  const mode: ServiceAreaMode =
    company?.serviceAreaMode === "radius" || company?.serviceAreaMode === "list"
      ? company.serviceAreaMode
      : legacyRadiusText
        ? "radius"
        : "list";
  return {
    mode,
    radiusMiles,
    centerAddress:
      typeof company?.serviceAreaCenterAddress === "string"
        ? company.serviceAreaCenterAddress.trim()
        : "",
    locations:
      savedLocations.length > 0
        ? savedLocations
        : activeLocations.filter((entry) => !RADIUS_PATTERN.test(entry)),
    notes,
  };
}
export function serviceAreaToCompanyConfig(settings: ServiceAreaSettings): {
  serviceAreaMode: ServiceAreaMode;
  serviceAreaRadiusMiles: number;
  serviceAreaCenterAddress: string;
  serviceArea: string[];
  serviceAreaList: string[];
  serviceAreaNotes: string;
} {
  const locations = normalizeServiceAreaLocations(settings.locations);
  const radiusMiles = Math.min(250, Math.max(1, Math.round(Number(settings.radiusMiles) || 0)));
  return {
    serviceAreaMode: settings.mode,
    serviceAreaRadiusMiles: radiusMiles,
    serviceAreaCenterAddress: String(settings.centerAddress ?? "").trim(),
    serviceArea: settings.mode === "list" ? locations : [],
    serviceAreaList: locations,
    serviceAreaNotes: String(settings.notes ?? "").trim(),
  };
}
export function formatServiceAreaSummary(settings: ServiceAreaSettings): string {
  if (settings.mode === "radius") {
    return settings.centerAddress
      ? `${settings.radiusMiles}-mile radius from ${settings.centerAddress}`
      : `${settings.radiusMiles}-mile radius (company location needed)`;
  }
  return settings.locations.length > 0
    ? settings.locations.join(", ")
    : "No ZIP codes or cities set";
}
