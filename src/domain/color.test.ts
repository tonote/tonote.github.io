import { describe, it, expect } from 'vitest';
import { argbToCss, cssToArgb, categoryColorToCss } from './color';

describe('argbToCss', () => {
  it('decodes Android default white (-394759 = 0xFFF9F9F9)', () => {
    expect(argbToCss(-394759)).toBe('rgba(249,249,249,1)');
  });
  it('decodes a fully-transparent color (0)', () => {
    expect(argbToCss(0)).toBe('rgba(0,0,0,0)');
  });
  it('decodes opaque red (0xFFFF0000 = -65536)', () => {
    expect(argbToCss(-65536)).toBe('rgba(255,0,0,1)');
  });
  it('decodes opaque blue (0xFF0000FF = -16776961)', () => {
    expect(argbToCss(-16776961)).toBe('rgba(0,0,255,1)');
  });
});

describe('cssToArgb (inverse)', () => {
  it('round-trips -394759 (0xFFF9F9F9)', () => {
    expect(cssToArgb(249, 249, 249, 1)).toBe(-394759);
  });
  it('round-trips -65536 (opaque red)', () => {
    expect(cssToArgb(255, 0, 0, 1)).toBe(-65536);
  });
  it('returns a signed Int32 for high-alpha', () => {
    const v = cssToArgb(0, 0, 0, 1); // 0xFF000000 → signed = -16777216
    expect(v).toBe(-16777216);
  });
});

it('uses the theme color only for the exact default category value', () => {
  expect(categoryColorToCss(-394759)).toBe('var(--category-default)');
  expect(categoryColorToCss(0xFFF9F9F9)).toBe('var(--category-default)');
  expect(categoryColorToCss(-1)).toBe('rgba(255,255,255,1)');
  expect(categoryColorToCss(-65536)).toBe('rgba(255,0,0,1)');
  expect(categoryColorToCss(0)).toBe('rgba(0,0,0,0)');
});
