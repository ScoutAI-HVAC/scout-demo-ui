const ACRONYMS = new Set(["ac", "hvac", "fau", "seer", "rtu", "pm", "hoa", "llc"]);
export function proCase(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      const bare = word.toLowerCase();
      if (ACRONYMS.has(bare)) {
        return bare.toUpperCase();
      }
      const i = word.search(/[a-z]/i);
      return i < 0 ? word : word.slice(0, i) + word[i].toUpperCase() + word.slice(i + 1);
    })
    .join(" ");
}
export function sentenceCase(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  return /^[a-z]/.test(t) ? t[0].toUpperCase() + t.slice(1) : t;
}
export function humanizeToken(raw: string | undefined | null): string {
  return sentenceCase((raw ?? "").replace(/[_-]+/g, " "));
}
export function campaignCustomerName(
  raw: string | undefined | null,
  fallback = "An unnamed customer",
): string {
  const name = raw?.trim();
  return !name || name === "there" ? fallback : name;
}
const BUSINESS_WORDS =
  /\b(llc|inc|corp|co|company|group|properties|property|mgmt|management|hoa|assoc|association|church|school|apartments|apts|suite|ste|plaza|center|centre|office|dental|medical|clinic|restaurant|cafe|hotel|motel|storage|realty|holdings|partners|enterprises|industries|farms|solutions|services)\b/i;
export function looksCommercial(name: string | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) {
    return false;
  }
  if (BUSINESS_WORDS.test(n)) {
    return true;
  }
  if (/^\d{2,}\s/.test(n)) {
    return true;
  }
  if (n.length > 6 && n === n.toUpperCase() && n.includes(" ")) {
    return true;
  }
  return false;
}
