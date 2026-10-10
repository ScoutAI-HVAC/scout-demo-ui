const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENSION = "^{}\\[~]|€\f";
const basic = new Set(GSM_BASIC);
const extension = new Set(GSM_EXTENSION);
export interface SmsLength {
  chars: number;
  encoding: "GSM-7" | "UCS-2";
  segments: number;
}
export function smsLength(text: string): SmsLength {
  const chars = text.length;
  if (chars === 0) {
    return { chars: 0, encoding: "GSM-7", segments: 0 };
  }
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (basic.has(ch)) {
      units += 1;
    } else if (extension.has(ch)) {
      units += 2;
    } else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { chars, encoding: "GSM-7", segments: units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  return { chars, encoding: "UCS-2", segments: chars <= 70 ? 1 : Math.ceil(chars / 67) };
}
