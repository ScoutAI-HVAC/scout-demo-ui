"use client";
import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
export const MAX_LINES_PHONE = 6;
export const MAX_LINES_WIDE = 8;
const TWIN_STYLES = [
  "boxSizing",
  "width",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "fontStretch",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "textIndent",
  "textTransform",
  "wordSpacing",
  "tabSize",
  "wordBreak",
  "overflowWrap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
] as const;
let twin: HTMLTextAreaElement | null = null;
function twinLike(box: HTMLTextAreaElement, style: CSSStyleDeclaration): HTMLTextAreaElement {
  if (!twin) {
    twin = document.createElement("textarea");
    twin.setAttribute("aria-hidden", "true");
    twin.tabIndex = -1;
    twin.readOnly = true;
    twin.rows = 1;
    twin.style.cssText =
      "position:absolute;top:0;left:-9999px;height:0;min-height:0;max-height:none;overflow:hidden;visibility:hidden;pointer-events:none";
  }
  if (!twin.isConnected) {
    document.body.appendChild(twin);
  }
  for (const name of TWIN_STYLES) {
    twin.style[name] = style[name];
  }
  return twin;
}
function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
export function fitToText(box: HTMLTextAreaElement): void {
  if (box.offsetWidth === 0) {
    return;
  }
  const style = getComputedStyle(box);
  const measure = twinLike(box, style);
  const edge =
    style.boxSizing === "border-box"
      ? px(style.borderTopWidth) + px(style.borderBottomWidth)
      : -(px(style.paddingTop) + px(style.paddingBottom));
  const heightOf = (text: string) => {
    measure.value = text;
    return measure.scrollHeight + edge;
  };
  const oneLine = heightOf("x");
  const line = heightOf("x\nx") - oneLine;
  if (oneLine <= 0 || line <= 0) {
    return;
  }
  const wide = window.matchMedia?.("(min-width: 640px)").matches === true;
  const cap = oneLine + line * ((wide ? MAX_LINES_WIDE : MAX_LINES_PHONE) - 1);
  const full = Math.max(oneLine, heightOf(box.value));
  box.style.height = `${Math.min(full, cap)}px`;
  box.style.overflowY = full > cap ? "auto" : "hidden";
}
export function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
    return;
  }
  event.preventDefault();
  const form = event.currentTarget.form;
  const send = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (form && !send?.disabled) {
    form.requestSubmit(send ?? null);
  }
}
export default function GrowingTextarea({
  ref,
  value,
  enterKeyHint = "send",
  ...props
}: Omit<ComponentProps<"textarea">, "value" | "rows"> & {
  value: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => box.current as HTMLTextAreaElement, []);
  useLayoutEffect(() => {
    if (box.current) {
      fitToText(box.current);
    }
  }, [value]);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) {
      return undefined;
    }
    let width = node.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (node.offsetWidth !== width) {
        width = node.offsetWidth;
        fitToText(node);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <textarea ref={box} value={value} rows={1} enterKeyHint={enterKeyHint} {...props} />;
}
