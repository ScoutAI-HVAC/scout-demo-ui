type Cell = string | number | null | undefined;
export function reportCsv(rows: Cell[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = value == null ? "" : String(value);
            const safe =
              typeof value === "string" && /^[\s]*[=+@\-\t\r\n]/.test(text) ? `'${text}` : text;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function downloadReportCsv(filename: string, rows: Cell[][]) {
  const url = URL.createObjectURL(new Blob([reportCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function campaignReportRows(
  flows: Array<{
    id: string;
    name: string;
    state: string;
    enrolled: number;
    touchesSent: number;
    replied: number;
    paid: number;
    booked: number;
    collectedDollars: number;
    wonDollars?: number;
  }>,
  sinceMs: number,
  generatedAtMs: number,
): Cell[][] {
  return [
    ["Report window starts", new Date(sinceMs).toISOString()],
    ["Generated at", new Date(generatedAtMs).toISOString()],
    ["Basis", "Lifetime totals for campaigns active in the report window; not period-only revenue"],
    [
      "Campaign ID",
      "Campaign",
      "State",
      "Enrolled",
      "Texts sent",
      "Replied",
      "Paid",
      "Booked",
      "Collected USD",
      "Value after outreach USD",
    ],
    ...flows.map((f) => [
      f.id,
      f.name,
      f.state,
      f.enrolled,
      f.touchesSent,
      f.replied,
      f.paid,
      f.booked,
      f.collectedDollars,
      f.wonDollars,
    ]),
  ];
}
