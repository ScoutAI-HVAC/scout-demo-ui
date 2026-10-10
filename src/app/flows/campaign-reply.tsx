"use client";
import { useCampaignPhonePrivacy } from "@/components/campaign-phone-privacy";
import { renderScoutBlocks } from "@/lib/scout-prose";
export const CAMPAIGN_VOICE =
  "Speak to the owner in short, plain sentences. Explain the business facts, not the machinery. " +
  "Never output JSON, code, tool names, internal field names or record IDs in your reply; the verified campaign review link is the only internal reference needed. " +
  "Use customer names and printed invoice numbers instead. Keep exact amounts, dates, limitations and warnings. " +
  "When drafting customer texts, use the supported personalization tags, not one sample customer's details for everyone. " +
  "Use customer_first_name for greetings; account names may be businesses. Equipment labels and approximate ages refer to the same qualifying unit. " +
  "Keep mixed-equipment outreach neutral: don't assume cooling, refrigerant, fuel, lifespan or failure from age alone. " +
  "Don't invent discounts, availability, payment links, membership benefits or remaining equipment life. Unknown facts stay unknown; explain missing coverage. ";
export const LAST_VISIT_AUDIENCE =
  'For customers the owner has not seen, visited or serviced in N months or a year, use dormant_customers with segmentParams {"minMonthsSinceVisit": N} (1-24 calendar months): ' +
  "customers with at least one completed visit in the CRM whose last one was more than N months ago and nothing on the books since; no equipment needed. " +
  "minMonthsQuiet counts any recorded activity, including invoices and payments; use it only when the owner means activity, and never both. ";
const UNREADABLE = "Please ask Scout to explain those details in plain language.";
function label(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}
function facts(value: unknown, depth = 0): string {
  if (depth > 8) {
    return "Ask Scout for more detail.";
  }
  if (value === null) {
    return "Not provided";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => facts(v, depth + 1)).join("\n\n") : "None listed";
  }
  if (typeof value === "object") {
    return Object.keys(value).length
      ? Object.entries(value)
          .map(([key, v]) => `${label(key)}: ${facts(v, depth + 1)}`)
          .join("\n")
      : "No details were provided.";
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "Not provided";
}
export function campaignReplyText(raw: string, streaming = false): string {
  const text = raw.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => label(key).toLowerCase());
  let result = "";
  let i = 0;
  while (i < text.length) {
    const fence = text.startsWith("```", i) ? "```" : text.startsWith("~~~", i) ? "~~~" : null;
    if (fence) {
      const headerEnd = text.indexOf("\n", i + 3);
      const end = headerEnd < 0 ? -1 : text.indexOf(fence, headerEnd + 1);
      if (end < 0) {
        if (!streaming) {
          result += UNREADABLE;
        }
        break;
      }
      const body = text.slice(headerEnd + 1, end).trim();
      try {
        result += "\n" + facts(JSON.parse(body)) + "\n";
      } catch {
        result +=
          "\n" +
          (/^(?:text|plaintext)$/i.test(text.slice(i + 3, headerEnd).trim())
            ? campaignReplyText(body)
            : UNREADABLE) +
          "\n";
      }
      i = end + 3;
      continue;
    }
    const tail = text.slice(i);
    const link = text[i] === "[" ? /^\[[^\]\n]+\]\(\S+?\)/.exec(tail) : null;
    if (link) {
      result += link[0];
      i += link[0].length;
      continue;
    }
    if (streaming && tail.trim() === "[") {
      break;
    }
    if (text[i] === "{" || (text[i] === "[" && /^\[\s*(?:[{"\d\]-]|true|false|null)/.test(tail))) {
      let depth = 0,
        quoted = false,
        escaped = false,
        end = i;
      for (; end < text.length; end++) {
        const c = text[end];
        if (quoted) {
          if (escaped) {
            escaped = false;
          } else if (c === "\\") {
            escaped = true;
          } else if (c === '"') {
            quoted = false;
          }
        } else if (c === '"') {
          quoted = true;
        } else if (c === "{" || c === "[") {
          depth++;
        } else if ((c === "}" || c === "]") && --depth === 0) {
          end++;
          break;
        }
      }
      if (depth !== 0 || quoted) {
        if (!streaming) {
          result += UNREADABLE;
        }
        break;
      }
      try {
        result += "\n" + facts(JSON.parse(text.slice(i, end))) + "\n";
      } catch {
        result += UNREADABLE;
      }
      i = end;
      continue;
    }
    result += text[i++];
  }
  return result
    .replace(/^\s*(?:json|\/\/.*)\s*$/gim, "")
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/~+$/g, "")
    .replace(/(\]\()?(?:https?:\/\/[^\s/)]+)?(\/flows\/[a-zA-Z0-9_-]+)/g, (_match, target, path) =>
      target ? `${target}${path}` : "your campaign draft",
    )
    .trim();
}
export function CampaignReply({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const { displayText } = useCampaignPhonePrivacy();
  const readable = displayText(campaignReplyText(text, streaming), streaming);
  return (
    <>{renderScoutBlocks(readable || (streaming ? "Putting that into plain language…" : ""))}</>
  );
}
