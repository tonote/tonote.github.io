import { describe, it, expect } from 'vitest';
import { parse } from './parse';
import type { Block, InlineRun, InlineMark } from './types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, `../../../tests/fixtures/knife/${name}`), 'utf-8');
}

function findRuns(block: Block): InlineRun[] {
  if (block.runs) return block.runs;
  if (block.items) return block.items.flat();
  if (block.children) return block.children.flatMap(findRuns);
  return [];
}

function hasMark(runs: InlineRun[], type: InlineMark['type']): boolean {
  return runs.some(r => r.marks.some(m => m.type === type));
}

function findMark(runs: InlineRun[], type: InlineMark['type']): InlineMark | undefined {
  for (const r of runs) {
    for (const m of r.marks) {
      if (m.type === type) return m;
    }
  }
  return undefined;
}

describe('Knife HTML parser', () => {
  it('parses bold and italic', () => {
    const doc = parse(fixture('bold-italic.html'));
    const runs = doc.blocks.flatMap(findRuns);
    expect(hasMark(runs, 'bold')).toBe(true);
    expect(hasMark(runs, 'italic')).toBe(true);
    // Check text content
    const texts = runs.map(r => r.text).join('');
    expect(texts).toContain('bold');
    expect(texts).toContain('italic');
  });

  it('parses underline, strikethrough, subscript, superscript', () => {
    const doc = parse(fixture('underline-strike-sub-sup.html'));
    const runs = doc.blocks.flatMap(findRuns);
    expect(hasMark(runs, 'underline')).toBe(true);
    expect(hasMark(runs, 'strikethrough')).toBe(true);
    expect(hasMark(runs, 'subscript')).toBe(true);
    expect(hasMark(runs, 'superscript')).toBe(true);
  });

  it('parses font-size from span style', () => {
    const doc = parse(fixture('font-size.html'));
    const runs = doc.blocks.flatMap(findRuns);
    const fontSizeMark = findMark(runs, 'fontSize');
    expect(fontSizeMark).toBeDefined();
    expect(fontSizeMark!.value).toBe(1.5);
    // Also check small
    const allFontSize = runs.flatMap(r => r.marks.filter(m => m.type === 'fontSize'));
    const small = allFontSize.find(m => m.value === 0.8);
    expect(small).toBeDefined();
  });

  it('parses text color as ARGB int', () => {
    const doc = parse(fixture('text-color.html'));
    const runs = doc.blocks.flatMap(findRuns);
    // #fff9f9f9 = -394759 as signed int32
    const colorMark = findMark(runs, 'textColor');
    expect(colorMark).toBeDefined();
    expect(colorMark!.value).toBe(-394759);
  });

  it('parses background color as ARGB int', () => {
    const doc = parse(fixture('background-color.html'));
    const runs = doc.blocks.flatMap(findRuns);
    const hlMark = findMark(runs, 'highlight');
    expect(hlMark).toBeDefined();
    // #80ffff00 → 0x80FFFF00 = signed int32 = -2130706688
    expect(hlMark!.value).toBe(-2130706688);
  });

  it('parses bullet list into bulletList block with items', () => {
    const doc = parse(fixture('bullet.html'));
    expect(doc.blocks.length).toBe(1);
    expect(doc.blocks[0].type).toBe('bulletList');
    expect(doc.blocks[0].items).toBeDefined();
    expect(doc.blocks[0].items!.length).toBe(2);
    expect(doc.blocks[0].items![0].some(r => r.text.includes('first'))).toBe(true);
    expect(doc.blocks[0].items![1].some(r => r.text.includes('second'))).toBe(true);
  });

  it('parses blockquote into quote block', () => {
    const doc = parse(fixture('quote.html'));
    expect(doc.blocks.length).toBe(1);
    expect(doc.blocks[0].type).toBe('quote');
    const runs = findRuns(doc.blocks[0]);
    expect(runs.some(r => r.text.includes('quote'))).toBe(true);
  });

  it('parses text-align from div style', () => {
    const doc = parse(fixture('alignment.html'));
    expect(doc.blocks.length).toBe(1);
    expect(doc.blocks[0].align).toBe('center');
  });

  it('normalizes variants: strong→bold, em→italic, big→fontSize 1.25, font color→textColor, s→strike', () => {
    const doc = parse(fixture('variants.html'));
    const runs = doc.blocks.flatMap(findRuns);
    expect(hasMark(runs, 'bold')).toBe(true);   // <strong>
    expect(hasMark(runs, 'italic')).toBe(true);   // <em> and <cite>
    const bigMark = findMark(runs, 'fontSize');
    expect(bigMark).toBeDefined();
    expect(bigMark!.value).toBe(1.25);           // <big>
    const fontColorMark = findMark(runs, 'textColor');
    expect(fontColorMark).toBeDefined();
    // #ff0000 → 0xFFFF0000 = -65536 as signed
    expect(fontColorMark!.value).toBe(-65536);
    expect(hasMark(runs, 'strikethrough')).toBe(true); // <s>
  });

  it('parses mixed content with multiple block types', () => {
    const doc = parse(fixture('mixed.html'));
    // Should have multiple blocks: paragraph (aligned), paragraph, bulletList, quote, paragraph
    expect(doc.blocks.length).toBeGreaterThanOrEqual(3);
    const types = doc.blocks.map(b => b.type);
    expect(types).toContain('paragraph');
    expect(types).toContain('bulletList');
    expect(types).toContain('quote');
  });

  it('decodes HTML entities', () => {
    const doc = parse(fixture('entities.html'));
    const runs = doc.blocks.flatMap(findRuns);
    const text = runs.map(r => r.text).join('');
    expect(text).toContain('<');
    expect(text).toContain('>');
    expect(text).toContain('&');
  });

  it('handles empty input', () => {
    const doc = parse('');
    expect(doc.blocks).toEqual([]);
  });

  it('handles plain text (no tags)', () => {
    const doc = parse('just plain text');
    expect(doc.blocks.length).toBe(1);
    expect(doc.blocks[0].type).toBe('paragraph');
    const runs = findRuns(doc.blocks[0]);
    expect(runs.map(r => r.text).join('')).toBe('just plain text');
  });

  it('parses links', () => {
    const doc = parse('<a href="https://example.com">link text</a>');
    const runs = doc.blocks.flatMap(findRuns);
    const linkMark = findMark(runs, 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark!.value).toBe('https://example.com');
    expect(runs.some(r => r.text === 'link text')).toBe(true);
  });

  it('parses h1-h6 as fontSize + bold paragraph blocks', () => {
    const doc = parse(fixture('headings.html'));
    expect(doc.blocks.length).toBe(3);

    // h1 → fontSize 1.5, bold
    const h1Runs = findRuns(doc.blocks[0]);
    expect(h1Runs.some(r => r.text === 'Title')).toBe(true);
    const h1Bold = findMark(h1Runs, 'bold');
    expect(h1Bold).toBeDefined();
    const h1FontSize = findMark(h1Runs, 'fontSize');
    expect(h1FontSize).toBeDefined();
    expect(h1FontSize!.value).toBe(1.5);

    // h2 → fontSize 1.4, bold
    const h2Runs = findRuns(doc.blocks[1]);
    expect(h2Runs.some(r => r.text === 'Section')).toBe(true);
    const h2FontSize = findMark(h2Runs, 'fontSize');
    expect(h2FontSize).toBeDefined();
    expect(h2FontSize!.value).toBe(1.4);
    const h2Bold = findMark(h2Runs, 'bold');
    expect(h2Bold).toBeDefined();

    // h3 → fontSize 1.3, bold
    const h3Runs = findRuns(doc.blocks[2]);
    expect(h3Runs.some(r => r.text === 'Sub')).toBe(true);
    const h3FontSize = findMark(h3Runs, 'fontSize');
    expect(h3FontSize).toBeDefined();
    expect(h3FontSize!.value).toBe(1.3);
  });
});
