const KEYBOARD_MIN_PX = 40;
export function phoneKeyboardOpen(viewport: Pick<VisualViewport, "height">): boolean {
  return document.documentElement.clientHeight - viewport.height > KEYBOARD_MIN_PX;
}
