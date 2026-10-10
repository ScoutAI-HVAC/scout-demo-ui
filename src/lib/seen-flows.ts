const KEY = "scout-seen-flows";
function read(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}
function write(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {}
}
export function unseenFlowIds(currentIds: string[]): Set<string> {
  const seen = read();
  if (seen === null) {
    write(new Set(currentIds));
    return new Set();
  }
  return new Set(currentIds.filter((id) => !seen.has(id)));
}
export function markFlowSeen(id: string): void {
  const seen = read() ?? new Set<string>();
  if (seen.has(id)) return;
  seen.add(id);
  write(seen);
}
