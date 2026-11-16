import type { Color } from './types';

export const DEFAULT_CATEGORY_COLOR = -394759; // Android: 0xFFF9F9F9
export const DEFAULT_CATEGORY_ID = '00000000-0000-0000-0000-000000000000';
export const DEFAULT_CATEGORY: Color = {
  id: DEFAULT_CATEGORY_ID, edited: 0, value: DEFAULT_CATEGORY_COLOR,
  theme: '', priority: 0, showAsFilter: false,
};

export function isDefaultCategoryColor(value: number): boolean {
  return (value >>> 0) === (DEFAULT_CATEGORY_COLOR >>> 0);
}

export function categoryColorToCss(value: number): string {
  return isDefaultCategoryColor(value) ? 'var(--category-default)' : argbToCss(value);
}

export function argbToCss(num: number): string {
  num >>>= 0; // to UInt32, handles signed negatives
  const b = num & 0xFF,
    g = (num & 0xFF00) >>> 8,
    r = (num & 0xFF0000) >>> 16,
    a = ((num & 0xFF000000) >>> 24) / 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function cssToArgb(r: number, g: number, b: number, a = 1): number {
  const u = ((Math.round(a * 255) << 24) | (r << 16) | (g << 8) | b) >>> 0;
  return u > 0x7FFFFFFF ? u - 0x100000000 : u; // back to signed Int32
}

export function categoryTextToCss(value: number): string {
  if (isDefaultCategoryColor(value)) return 'var(--category-default-text)';
  if ((value >>> 24) !== 255) return 'var(--text)';
  const channels = [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
  const luminance = channels.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * luminance[0] + .7152 * luminance[1] + .0722 * luminance[2] > .179 ? '#101010' : '#ffffff';
}
