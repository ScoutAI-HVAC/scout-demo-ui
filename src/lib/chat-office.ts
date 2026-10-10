import JSZip from "jszip";
import { OLDER_EXCEL } from "./chat-attachments";
export const MAX_DOCUMENT_TEXT = 60000;
const PART_MAX_BYTES = 40 * 1024 * 1024;
const PACKAGE_MAX_BYTES = 120 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;
const MAX_SHEETS = 20;
const MAX_PARSED_ROWS = 20000;
const MAX_COLUMNS = 256;
export type ReadText = {
  text: string;
  note?: string;
};
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}
function isZip(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
}
const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
export function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (whole, name: string) => {
      if (name[0] !== "#") return ENTITY[name.toLowerCase()] ?? whole;
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
const ATTR_PATTERNS = new Map<string, RegExp>();
function attr(tag: string, name: string): string | undefined {
  let pattern = ATTR_PATTERNS.get(name);
  if (!pattern) {
    pattern = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`);
    ATTR_PATTERNS.set(name, pattern);
  }
  const match = tag.match(pattern);
  return match ? decodeXml(match[2] ?? match[3] ?? "") : undefined;
}
function zipEntryCount(bytes: Uint8Array): number | undefined {
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (
      bytes[at] === 0x50 &&
      bytes[at + 1] === 0x4b &&
      bytes[at + 2] === 5 &&
      bytes[at + 3] === 6
    ) {
      return bytes[at + 10] | (bytes[at + 11] << 8);
    }
  }
  return undefined;
}
class OfficePackage {
  private left = PACKAGE_MAX_BYTES;
  private constructor(private readonly zip: JSZip) {}
  static async open(bytes: Uint8Array, label: string): Promise<OfficePackage> {
    if (startsWith(bytes, OLE_MAGIC))
      throw new Error(
        `This ${label} file is password-protected. Remove the password, save it, then attach it again.`,
      );
    const unreadable = `This ${label} file couldn't be opened. Check that it opens on your computer, then attach it again.`;
    if (!isZip(bytes) || (zipEntryCount(bytes) ?? 0) > MAX_ZIP_ENTRIES) throw new Error(unreadable);
    try {
      return new OfficePackage(await JSZip.loadAsync(bytes));
    } catch {
      throw new Error(unreadable);
    }
  }
  async part(name: string): Promise<string | undefined> {
    const entry =
      this.zip.file(name) ??
      Object.values(this.zip.files).find((file) => file.name.toLowerCase() === name.toLowerCase());
    if (!entry || entry.dir) return undefined;
    const stream = (
      entry as unknown as {
        internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream("uint8array");
    return await new Promise<string>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      stream
        .on("data", (chunk) => {
          size += chunk.length;
          this.left -= chunk.length;
          if (size > PART_MAX_BYTES || this.left < 0) {
            stream.pause();
            reject(
              new Error(
                "This file is too large to read. Attach a smaller file or just the part you need.",
              ),
            );
            return;
          }
          chunks.push(chunk);
        })
        .on("error", reject)
        .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
        .resume();
    });
  }
  static resolve(from: string, target: string): string {
    if (target.startsWith("/")) return target.slice(1);
    const parts = from.split("/").slice(0, -1);
    for (const segment of target.split("/")) {
      if (segment === "..") parts.pop();
      else if (segment && segment !== ".") parts.push(segment);
    }
    return parts.join("/");
  }
  async relationships(partName: string): Promise<
    Map<
      string,
      {
        type: string;
        target: string;
      }
    >
  > {
    const slash = partName.lastIndexOf("/");
    const relsName = `${partName.slice(0, slash + 1)}_rels/${partName.slice(slash + 1)}.rels`;
    const xml = (await this.part(relsName)) ?? "";
    const map = new Map<
      string,
      {
        type: string;
        target: string;
      }
    >();
    for (const [tag] of xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
      const id = attr(tag, "Id");
      const target = attr(tag, "Target");
      if (id && target && attr(tag, "TargetMode") !== "External")
        map.set(id, {
          type: attr(tag, "Type") ?? "",
          target: OfficePackage.resolve(partName, target),
        });
    }
    return map;
  }
  async mainPart(fallback: string): Promise<string> {
    for (const { type, target } of (await this.relationships("")).values()) {
      if (type.endsWith("/officeDocument")) return target;
    }
    return fallback;
  }
}
function csvField(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
export function csvRecords(text: string): string[] {
  const records: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') quoted = !quoted;
    else if (char === "\n" && !quoted) {
      records.push(text.slice(start, index).replace(/\r$/, ""));
      start = index + 1;
    }
  }
  if (start < text.length) records.push(text.slice(start).replace(/\r$/, ""));
  return records.filter((record) => record.replace(/[,\s]/g, "") !== "");
}
type Table = {
  title: string;
  rows: string[];
  totalRows: number;
  moreThan?: boolean;
  sheet?: string;
};
export function packTables(tables: Table[], budget = MAX_DOCUMENT_TEXT): ReadText {
  const share = new Map<Table, number>();
  let left = budget - tables.reduce((sum, table) => sum + table.title.length + 400, 0);
  const bySize = [...tables].sort(
    (a, b) =>
      a.rows.reduce((n, r) => n + r.length + 1, 0) - b.rows.reduce((n, r) => n + r.length + 1, 0),
  );
  bySize.forEach((table, index) => {
    const fair = Math.max(0, Math.floor(left / (bySize.length - index)));
    let used = 0;
    let count = 0;
    for (const row of table.rows) {
      if (used + row.length + 1 > fair) break;
      used += row.length + 1;
      count++;
    }
    share.set(table, count);
    left -= used;
  });
  const cut: string[] = [];
  const blocks = tables.map((table) => {
    const shown = share.get(table) ?? 0;
    const total = table.moreThan
      ? `more than ${table.totalRows.toLocaleString("en-US")}`
      : table.totalRows.toLocaleString("en-US");
    if (shown >= table.totalRows && !table.moreThan)
      return `${table.title} (${total} row${table.totalRows === 1 ? "" : "s"})\n${table.rows.join("\n")}`;
    cut.push(
      `the first ${shown.toLocaleString("en-US")} of ${total} rows${tables.length > 1 && table.sheet ? ` of "${table.sheet}"` : ""}`,
    );
    return `${table.title}: only the first ${shown.toLocaleString("en-US")} of ${total} rows are included below; the rest were cut to fit. Totals, counts or lookups over the whole sheet can't be taken from this excerpt - say so if the owner asks for them.\n${table.rows.slice(0, shown).join("\n")}`;
  });
  return {
    text: blocks.join("\n\n"),
    ...(cut.length ? { note: `Large file: Scout reads ${cut.join("; ")}.` } : {}),
  };
}
export function csvText(text: string, title: string): ReadText {
  const rows = csvRecords(text);
  if (rows.length === 0) throw new Error("This document has no readable text.");
  if (text.length <= MAX_DOCUMENT_TEXT) return { text };
  return packTables([{ title, rows, totalRows: rows.length }]);
}
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);
const BUILTIN_FORMATS: Record<number, string> = {
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  5: "$#,##0",
  6: "$#,##0",
  7: "$#,##0.00",
  8: "$#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  14: "m/d/yyyy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yyyy h:mm",
  39: "#,##0.00",
  40: "#,##0.00",
  42: "$#,##0",
  43: "#,##0.00",
  44: "$#,##0.00",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
};
type CellFormat = {
  kind: "date" | "percent" | "number";
  decimals?: number;
  currency?: string;
  date?: boolean;
  time?: boolean;
  seconds?: boolean;
};
export function cellFormat(numFmtId: number, code: string | undefined): CellFormat {
  const raw = code ?? BUILTIN_FORMATS[numFmtId] ?? "General";
  const section = raw.split(";")[0];
  const bare = section
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/[_*]./g, "")
    .replace(/\[\$-[^\]]*\]/g, "")
    .replace(/\[(?:h+|m+|s+)\]/gi, "h")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/General/gi, "");
  const isDate =
    BUILTIN_DATE_FORMATS.has(numFmtId) ||
    (!code ? false : /[dmyhs]/i.test(bare.replace(/E[+-]/gi, "")));
  if (isDate) {
    const time = /[hs]/i.test(bare) || /AM\/PM/i.test(section);
    const date = /[dy]/i.test(bare) || (!time && /m/i.test(bare));
    return { kind: "date", date, time, seconds: /s/i.test(bare) };
  }
  const decimals = bare.match(/\.([0#?]+)/)?.[1].length;
  if (bare.includes("%")) return { kind: "percent", decimals: decimals ?? 0 };
  const currency =
    section.match(/\[\$([^\]-]+)/)?.[1] ?? section.replace(/\[[^\]]*\]/g, "").match(/[$€£¥]/)?.[0];
  return { kind: "number", decimals, ...(currency ? { currency } : {}) };
}
const DAY_MS = 86400000;
export function excelDate(serial: number, format: CellFormat, date1904: boolean): string {
  const days = date1904 ? serial + 1462 : serial < 60 ? serial + 1 : serial;
  const when = new Date(Date.UTC(1899, 11, 30) + Math.round(days * 86400) * 1000);
  if (!Number.isFinite(when.getTime())) return String(serial);
  const iso = when.toISOString();
  const day = iso.slice(0, 10);
  if (format.date && format.time) return `${day} ${iso.slice(11, format.seconds ? 19 : 16)}`;
  if (format.date) return day;
  const seconds = Math.round(serial * 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}`;
  return format.seconds ? `${clock}:${pad(seconds % 60)}` : clock;
}
export function formatNumber(
  value: number,
  format: CellFormat | undefined,
  date1904: boolean,
): string {
  if (!format) return String(Number(value.toPrecision(15)));
  if (format.kind === "date") return excelDate(value, format, date1904);
  if (format.kind === "percent") return `${(value * 100).toFixed(format.decimals ?? 0)}%`;
  const digits =
    format.decimals !== undefined
      ? value.toFixed(format.decimals)
      : String(Number(value.toPrecision(15)));
  if (!format.currency) return digits;
  return digits.startsWith("-")
    ? `-${format.currency}${digits.slice(1)}`
    : `${format.currency}${digits}`;
}
function columnIndex(ref: string): number | undefined {
  const letters = ref.match(/^[A-Z]+/i)?.[0];
  if (!letters) return undefined;
  let index = 0;
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}
function stringItemText(xml: string): string {
  const visible = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let text = "";
  for (const match of visible.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([^<]*)<\/(?:\w+:)?t>/g))
    text += match[1];
  return decodeXml(text);
}
async function sharedStrings(pkg: OfficePackage, part: string | undefined): Promise<string[]> {
  const xml = part ? await pkg.part(part) : undefined;
  if (!xml) return [];
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) =>
    stringItemText(m[1] ?? ""),
  );
}
async function cellFormats(
  pkg: OfficePackage,
  part: string | undefined,
): Promise<(CellFormat | undefined)[]> {
  const xml = part ? await pkg.part(part) : undefined;
  if (!xml) return [];
  const codes = new Map<number, string>();
  for (const [tag] of xml.matchAll(/<(?:\w+:)?numFmt\b[^>]*>/g)) {
    const id = Number(attr(tag, "numFmtId"));
    const code = attr(tag, "formatCode");
    if (Number.isFinite(id) && code !== undefined) codes.set(id, code);
  }
  const xfs = xml.match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/)?.[1] ?? "";
  return [...xfs.matchAll(/<(?:\w+:)?xf\b[^>]*>/g)].map(([tag]) => {
    const id = Number(attr(tag, "numFmtId") ?? 0);
    return id === 0 && !codes.has(0) ? undefined : cellFormat(id, codes.get(id));
  });
}
type SheetContext = {
  strings: string[];
  formats: (CellFormat | undefined)[];
  date1904: boolean;
};
function cellValue(open: string, body: string, context: SheetContext): string {
  const type = attr(open, "t") ?? "n";
  if (type === "inlineStr") return stringItemText(body);
  const raw = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
  if (raw === undefined) return "";
  const value = decodeXml(raw);
  if (type === "s") return context.strings[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  if (type === "str" || type === "e" || type === "d") return value;
  const number = Number(value);
  if (!Number.isFinite(number) || value.trim() === "") return value;
  return formatNumber(number, context.formats[Number(attr(open, "s") ?? 0)], context.date1904);
}
function sheetRows(
  xml: string,
  context: SheetContext,
): {
  rows: string[];
  totalRows: number;
  moreThan: boolean;
} {
  const parsed: string[][] = [];
  let firstColumn = MAX_COLUMNS;
  let totalRows = 0;
  let moreThan = false;
  const rowPattern = /<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
  for (const rowMatch of xml.matchAll(rowPattern)) {
    if (parsed.length >= MAX_PARSED_ROWS) {
      moreThan = true;
      break;
    }
    const cells: string[] = [];
    let next = 0;
    for (const cell of (rowMatch[1] ?? "").matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,
    )) {
      const ref = attr(cell[1], "r");
      const column = (ref ? columnIndex(ref) : undefined) ?? next;
      next = column + 1;
      if (column >= MAX_COLUMNS) continue;
      const value = cellValue(cell[1], cell[2] ?? "", context);
      if (value === "") continue;
      cells[column] = value;
      firstColumn = Math.min(firstColumn, column);
    }
    if (cells.length === 0) continue;
    totalRows++;
    parsed.push(cells);
  }
  const rows = parsed.map((cells) =>
    Array.from({ length: cells.length - firstColumn }, (_, i) =>
      csvField(cells[firstColumn + i] ?? ""),
    ).join(","),
  );
  return { rows, totalRows, moreThan };
}
export async function xlsxText(bytes: Uint8Array): Promise<ReadText> {
  const pkg = await OfficePackage.open(bytes, "Excel");
  const workbookPart = await pkg.mainPart("xl/workbook.xml");
  const workbook = await pkg.part(workbookPart);
  if (!workbook)
    throw new Error(
      "This Excel file couldn't be opened. Check that it opens on your computer, then attach it again.",
    );
  const rels = await pkg.relationships(workbookPart);
  const relOfType = (suffix: string) =>
    [...rels.values()].find((rel) => rel.type.endsWith(suffix))?.target;
  const context: SheetContext = {
    strings: await sharedStrings(pkg, relOfType("/sharedStrings")),
    formats: await cellFormats(pkg, relOfType("/styles")),
    date1904: /<(?:\w+:)?workbookPr\b[^>]*\sdate1904\s*=\s*["'](?:1|true)["']/.test(workbook),
  };
  const sheets = [...workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map(([tag]) => ({
    name: attr(tag, "name") ?? "Sheet",
    hidden: (attr(tag, "state") ?? "visible") !== "visible",
    rel: rels.get(tag.match(/\s(?:[\w.-]+:)?id\s*=\s*["']([^"']*)["']/)?.[1] ?? ""),
  }));
  const tables: Table[] = [];
  const skipped: string[] = [];
  for (const sheet of sheets) {
    if (!sheet.rel || !sheet.rel.type.endsWith("/worksheet")) continue;
    if (tables.length >= MAX_SHEETS) {
      skipped.push(sheet.name);
      continue;
    }
    const xml = (await pkg.part(sheet.rel.target)) ?? "";
    const { rows, totalRows, moreThan } = sheetRows(xml, context);
    if (rows.length === 0) continue;
    tables.push({
      title: `Sheet "${sheet.name}"${sheet.hidden ? " [hidden]" : ""}`,
      rows,
      totalRows,
      moreThan,
      sheet: sheet.name,
    });
  }
  if (tables.length === 0) throw new Error("This spreadsheet has no data Scout can read.");
  const packed = packTables(tables);
  if (skipped.length === 0) return packed;
  const more = `${skipped.length} more sheet${skipped.length === 1 ? "" : "s"} (${skipped.join(", ")}) weren't included`;
  return {
    text: `${packed.text}\n\nOnly the first ${MAX_SHEETS} sheets are included; ${more}.`,
    note: `${packed.note ? `${packed.note} ` : ""}Scout reads the first ${MAX_SHEETS} sheets.`,
  };
}
export async function xlsText(bytes: Uint8Array, fileName: string): Promise<ReadText> {
  if (isZip(bytes)) return xlsxText(bytes);
  if (startsWith(bytes, OLE_MAGIC)) throw new Error(OLDER_EXCEL);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    throw new Error(OLDER_EXCEL);
  }
  if (/<table\b/i.test(text)) {
    const rows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((row) =>
        [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
          .map((cell) =>
            csvField(
              decodeXml(cell[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
                .replace(/\s+/g, " ")
                .trim(),
            ),
          )
          .join(","),
      )
      .filter((row) => row.replace(/[,\s]/g, "") !== "");
    if (rows.length === 0) throw new Error("This spreadsheet has no data Scout can read.");
    return packTables([{ title: `Sheet "${fileName}"`, rows, totalRows: rows.length }]);
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error(OLDER_EXCEL);
  return csvText(text, `Sheet "${fileName}"`);
}
export async function docxText(bytes: Uint8Array): Promise<string> {
  const pkg = await OfficePackage.open(bytes, "Word");
  const xml = await pkg.part(await pkg.mainPart("word/document.xml"));
  if (!xml)
    throw new Error(
      "This Word file couldn't be opened. Check that it opens on your computer, then attach it again.",
    );
  const body = xml
    .replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, "")
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "");
  let out = "";
  let cell = "";
  let row: string[] = [];
  let tableDepth = 0;
  const write = (text: string) => {
    if (tableDepth > 0) cell += text;
    else out += text;
  };
  const token =
    /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br|cr|noBreakHyphen)\b[^>]*\/>|<(\/?)w:(p|tc|tr|tbl)\b[^>]*?(\/?)>/g;
  for (const match of body.matchAll(token)) {
    if (match[1] !== undefined) write(decodeXml(match[1]));
    else if (match[2] === "tab") write("\t");
    else if (match[2] === "noBreakHyphen") write("-");
    else if (match[2]) write("\n");
    else {
      const closing = match[3] === "/";
      const selfClosing = match[5] === "/";
      const element = match[4];
      if (element === "tbl" && !selfClosing) {
        tableDepth += closing ? -1 : 1;
        if (tableDepth < 0) tableDepth = 0;
      } else if (element === "p" && (closing || selfClosing)) {
        write(tableDepth > 0 ? " " : "\n");
      } else if (element === "tc" && closing && tableDepth === 1) {
        row.push(cell.replace(/\s+/g, " ").trim());
        cell = "";
      } else if (element === "tc" && closing) {
        cell += " ";
      } else if (element === "tr" && closing && tableDepth === 1) {
        if (row.some(Boolean)) out += `${row.join(" | ")}\n`;
        row = [];
      }
    }
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
