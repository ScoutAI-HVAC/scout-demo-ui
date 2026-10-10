import type { ReactNode } from "react";
const MARKDOWN_ESCAPE = /\\([\\`*_{}[\]()#+\-.!><~|])/g;
const FENCE_LINE = /^\s*(?:```|~~~)\w*\s*$/;
const US_PHONE = /\+1[\s.-]?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g;
const ESCAPED_QUOTE_OPENER = /^(\s*)\\>/;
const ESCAPED_QUOTE_SENTINEL = "\u0000";
function normalizeScoutLines(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !FENCE_LINE.test(line))
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^(\s*)[-*]\s+/, "$1• ")
        .replace(ESCAPED_QUOTE_OPENER, `$1${ESCAPED_QUOTE_SENTINEL}`)
        .replace(MARKDOWN_ESCAPE, "$1")
        .replace(/`([^`\n]+)`/g, "$1"),
    );
  return lines
    .join("\n")
    .replace(US_PHONE, "($1) $2-$3")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function unescapeQuoteOpener(line: string): string {
  return line.replaceAll(ESCAPED_QUOTE_SENTINEL, ">");
}
export function normalizeScoutText(text: string): string {
  return unescapeQuoteOpener(normalizeScoutLines(text));
}
const LINK = /\[([^\]]+)\]\((\S+?)\)(?!\))|\[([^\]]+)\]\(([^()\n]*\s[^()\n]*)\)/g;
const SAFE_HREF = /^(https?:\/\/|tel:|mailto:|\/flows\/[\w-]+$)/i;
const ITALIC_SPLIT = /((?<![\w$])\*[^*\s](?:[^*\n]*?[^*\s])?\*(?!\w))/g;
function renderItalic(text: string, keyPrefix: string): ReactNode[] {
  return text.split(ITALIC_SPLIT).map((part, i) => {
    if (i % 2 === 1) {
      return <em key={`${keyPrefix}i${i}`}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
function renderBold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).flatMap((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}b${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return renderItalic(part, `${keyPrefix}b${i}`);
  });
}
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/;
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}
function tableAligns(separator: string): Array<"left" | "center" | "right"> {
  return tableCells(separator).map((cell) =>
    cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left",
  );
}
const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;
const QUOTE_LINE = /^\s*>\s?(.*)$/;
export function renderScoutBlocks(text: string): ReactNode[] {
  const lines = normalizeScoutLines(text).split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    if (QUOTE_LINE.test(lines[i])) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_LINE.test(lines[i])) {
        quoted.push(lines[i].replace(QUOTE_LINE, "$1").replace(/^(\s*)[-*]\s+/, "$1• "));
        i += 1;
      }
      out.push(
        <blockquote
          key={`q${key++}`}
          className={`border-l-2 border-tan-soft pl-3 text-ink-3 ${out.length > 0 ? "my-1.5" : "mb-1.5"}`}
        >
          {quoted.map((line, n) => (
            <p key={n} className={n > 0 ? "mt-1" : ""}>
              {renderProse(line)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }
    if (TABLE_ROW.test(lines[i]) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const header = tableCells(lines[i]);
      const aligns = tableAligns(lines[i + 1]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]) && !TABLE_SEPARATOR.test(lines[i])) {
        rows.push(tableCells(lines[i]));
        i += 1;
      }
      out.push(
        <div key={`t${key++}`} className="my-2 max-w-full overflow-x-auto">
          <table className="min-w-max border-collapse text-left">
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th
                    key={c}
                    className={`border-b border-tan-soft px-2 py-1 align-top font-semibold ${ALIGN_CLASS[aligns[c] ?? "left"]}`}
                  >
                    {renderProse(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className={r < rows.length - 1 ? "border-b border-tan-soft/60" : ""}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-2 py-1 align-top ${ALIGN_CLASS[aligns[c] ?? "left"]}`}
                    >
                      {renderProse(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    out.push(
      <p key={`p${key++}`} className={out.length > 0 ? "mt-1.5" : ""}>
        {renderProse(unescapeQuoteOpener(lines[i]))}
      </p>,
    );
    i += 1;
  }
  return out;
}
export function renderProse(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let seg = 0;
  LINK.lastIndex = 0;
  for (let m = LINK.exec(line); m !== null; m = LINK.exec(line)) {
    if (m.index > last) out.push(...renderBold(line.slice(last, m.index), `s${seg++}`));
    const [, linkLabel, href, placeholderLabel] = m;
    const label = linkLabel ?? placeholderLabel ?? "";
    if (href !== undefined && SAFE_HREF.test(href)) {
      out.push(
        <a
          key={`s${seg++}`}
          href={href}
          {...(href.toLowerCase().startsWith("http")
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className="font-medium text-terracotta-deep underline underline-offset-2"
        >
          {label}
        </a>,
      );
    } else {
      out.push(...renderBold(label, `s${seg++}`));
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(...renderBold(line.slice(last), `s${seg++}`));
  return out;
}
