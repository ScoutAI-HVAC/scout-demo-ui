export function phoneShapedQuery(query: string): boolean {
  const q = query.trim();
  return /^[\d\s().+-]+$/.test(q) && q.replace(/\D/g, "").length >= 3;
}
export function searchesMessages(query: string): boolean {
  const q = query.trim();
  return q.length >= 2 && !phoneShapedQuery(q);
}
const SEARCH_FOLD =
  /[\u0027\u2018\u2019\u02bc\u0022\u201c\u201d\-\u2010\u2011\u2013\u2014\u0020\t\n\r\u00a0]/g;
export function foldForSearch(text: string): string {
  return text.toLowerCase().replace(SEARCH_FOLD, "");
}
export function matchesInboxSearch(
  row: {
    name: string | null;
    phoneE164: string;
    lastBody: string;
  },
  query: string,
  textMatches?: ReadonlySet<string>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const fields = [row.name ?? "", row.phoneE164, row.lastBody];
  const words = phoneShapedQuery(q) ? "" : foldForSearch(q);
  if (
    words
      ? fields.some((field) => foldForSearch(field).includes(words))
      : fields.join(" ").toLowerCase().includes(q)
  ) {
    return true;
  }
  if (phoneShapedQuery(q) && row.phoneE164.replace(/\D/g, "").includes(q.replace(/\D/g, ""))) {
    return true;
  }
  return textMatches?.has(row.phoneE164) === true;
}
