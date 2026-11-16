/** Android stores ARGB; CSS expects RGBA. Keep the stored mark unchanged. */
export function knifeColorToCss(color: string): string {
  return /^#[\da-f]{8}$/i.test(color) ? `#${color.slice(3)}${color.slice(1, 3)}` : color;
}
