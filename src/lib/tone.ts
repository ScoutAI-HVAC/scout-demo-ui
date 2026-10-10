export type Tone =
  | "neutral"
  | "terracotta"
  | "sage"
  | "copper"
  | "golden"
  | "lavender"
  | "skyblue"
  | "alarm";
export interface ToneClasses {
  border: string;
  bg: string;
  text: string;
  icon: string;
}
const TONES: Record<Tone, ToneClasses> = {
  neutral: {
    border: "border-tan-soft",
    bg: "bg-paper-2",
    text: "text-ink-2",
    icon: "bg-paper-2 text-ink-2",
  },
  terracotta: {
    border: "border-terracotta-soft",
    bg: "bg-terracotta-tint",
    text: "text-terracotta-deep",
    icon: "bg-terracotta-tint text-terracotta-deep",
  },
  sage: {
    border: "border-sage-soft",
    bg: "bg-sage-tint",
    text: "text-sage-deep",
    icon: "bg-sage-tint text-sage-deep",
  },
  copper: {
    border: "border-copper-soft",
    bg: "bg-copper-tint",
    text: "text-copper",
    icon: "bg-copper-tint text-copper",
  },
  golden: {
    border: "border-golden-soft",
    bg: "bg-golden-tint",
    text: "text-copper",
    icon: "bg-golden-tint text-copper",
  },
  lavender: {
    border: "border-lavender-soft",
    bg: "bg-lavender-tint",
    text: "text-lavender",
    icon: "bg-lavender-tint text-lavender",
  },
  skyblue: {
    border: "border-skyblue-soft",
    bg: "bg-skyblue-tint",
    text: "text-skyblue",
    icon: "bg-skyblue-tint text-skyblue",
  },
  alarm: {
    border: "border-alarm-soft",
    bg: "bg-alarm-tint",
    text: "text-alarm",
    icon: "bg-alarm-tint text-alarm",
  },
};
export function tone(name: Tone = "neutral"): ToneClasses {
  return TONES[name];
}
export function toneSurface(name: Tone = "neutral"): string {
  const t = TONES[name];
  return `${t.bg} ${t.text}`;
}
