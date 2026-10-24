/**
 * Disc colours come from the CSS tokens of the *current* theme (docs/DESIGN.md §4.1, §6.3): `--paper` is the off
 * face, `--ink` the on face, `--signal` the charge tint. They are re-read after the DOM applies a theme and never
 * swapped by hand; which physical side is "off" is the renderer's `themeBit`.
 */
import { parseCssColor, type RendererColors, type RGB } from "../visible-rects";

const WHITE: RGB = [1, 1, 1];
const BLACK: RGB = [0, 0, 0];

export function readColors(): RendererColors {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: RGB): RGB => parseCssColor(style.getPropertyValue(name)) ?? fallback;
  return { faceA: token("--paper", WHITE), faceB: token("--ink", BLACK), signal: token("--signal", BLACK) };
}
