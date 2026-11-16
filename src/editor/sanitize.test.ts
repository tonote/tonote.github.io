import { describe, it, expect } from 'vitest';
import { sanitizeKnifeHtml } from './sanitize';

describe('sanitizeKnifeHtml', () => {
  it('keeps only Knife vocabulary and normalizes variants', () => {
    const messy = '<div class="x"><p>Hello</p><table><tr><td>cell</td></tr></table>' +
                  '<span style="color:#ff000000;font-size:2em">red big</span>' +
                  '<strong>bold</strong><script>alert(1)</script></div>';
    const out = sanitizeKnifeHtml(messy);
    expect(out).not.toContain('<table');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('class=');
    expect(out).toContain('red big');
    expect(out).toContain('bold'); // <strong> normalized to <b>
  });

  it('keeps allowed tags with their styles', () => {
    const out = sanitizeKnifeHtml('<b>x</b><ul><li>a</li></ul><blockquote>q</blockquote>');
    expect(out).toContain('<b>');
    expect(out).toContain('<ul>');
    expect(out).toContain('<blockquote>');
  });

  it('drops script tags', () => {
    const out = sanitizeKnifeHtml('<script>alert(1)</script>safe');
    expect(out).not.toContain('<script');
    expect(out).toContain('safe');
  });

  it('drops non-Knife attributes like class', () => {
    const out = sanitizeKnifeHtml('<span class="foo" style="color:#ff000000;">text</span>');
    expect(out).not.toContain('class=');
    expect(out).toContain('color:#ff000000');
  });

  it('normalizes <p> to plain text', () => {
    const out = sanitizeKnifeHtml('<p>paragraph text</p>');
    // After parse+serialize, <p> becomes a paragraph without <p> tags
    expect(out).not.toContain('<p>');
    expect(out).toContain('paragraph text');
  });

  it('normalizes <big> to font-size span', () => {
    const out = sanitizeKnifeHtml('<big>big text</big>');
    expect(out).toContain('font-size:');
    expect(out).not.toContain('<big>');
  });

  it('drops <font face="..."> attribute (keeps color)', () => {
    const out = sanitizeKnifeHtml('<font face="Arial" color="#ff0000">red text</font>');
    expect(out).not.toContain('face=');
    // color should be preserved as a textColor span
    expect(out).toContain('color:');
  });

  it('drops <img> and <input type="checkbox">', () => {
    const out = sanitizeKnifeHtml('text<img src="x">more<input type="checkbox">end');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<input');
  });

  it('handles empty input', () => {
    const out = sanitizeKnifeHtml('');
    expect(out).toBe('');
  });

  it('normalizes variants: <em>→<i>, <s>→<del>', () => {
    const out = sanitizeKnifeHtml('<em>italic</em><s>strike</s>');
    expect(out).toContain('<i>italic</i>');
    expect(out).toContain('<del>strike</del>');
  });
});
