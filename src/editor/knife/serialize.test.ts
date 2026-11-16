import { describe, it, expect } from 'vitest';
import { serialize } from './serialize';
import { parse } from './parse';
import type { KnifeDoc } from './types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, `../../../tests/fixtures/knife/${name}`), 'utf-8');
}

describe('Knife HTML serializer', () => {
  it('emits ARGB lowercase 8-hex for text color', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'x', marks: [{ type: 'textColor', value: -394759 }] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('color:#fff9f9f9;');
  });

  it('emits font-size in em with 0.# format', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'x', marks: [{ type: 'fontSize', value: 1.5 }] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('font-size:1.5em;');
  });

  it('emits integer font-size without trailing dot', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'x', marks: [{ type: 'fontSize', value: 2 }] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('font-size:2em;');
    expect(html).not.toContain('font-size:2.0em;');
  });

  it('escapes <, >, &', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'a < b > c & d', marks: [] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('a &lt; b &gt; c &amp; d');
  });

  it('emits alignment only when non-normal', () => {
    const centered: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'center',
        runs: [{ text: 'x', marks: [] }],
      }],
    };
    expect(serialize(centered)).toContain('text-align:center');

    const normal: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'x', marks: [] }],
      }],
    };
    expect(serialize(normal)).not.toContain('text-align');
  });

  it('emits <b> for bold, <i> for italic, <u> for underline, <del> for strikethrough', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [
          { text: 'b', marks: [{ type: 'bold' }] },
          { text: 'i', marks: [{ type: 'italic' }] },
          { text: 'u', marks: [{ type: 'underline' }] },
          { text: 'd', marks: [{ type: 'strikethrough' }] },
        ],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<b>b</b>');
    expect(html).toContain('<i>i</i>');
    expect(html).toContain('<u>u</u>');
    expect(html).toContain('<del>d</del>');
  });

  it('emits <sub> and <sup>', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [
          { text: 'sub', marks: [{ type: 'subscript' }] },
          { text: 'sup', marks: [{ type: 'superscript' }] },
        ],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<sub>sub</sub>');
    expect(html).toContain('<sup>sup</sup>');
  });

  it('emits <ul><li> for bulletList', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'bulletList', align: 'normal',
        items: [
          [{ text: 'a', marks: [] }],
          [{ text: 'b', marks: [] }],
        ],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<li>b</li>');
    expect(html).toContain('</ul>');
  });

  it('emits <blockquote> for quote', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'quote', align: 'normal',
        runs: [{ text: 'quoted', marks: [] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<blockquote>quoted</blockquote>');
  });

  it('emits <a href="..."> for links', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'link', marks: [{ type: 'link', value: 'https://example.com' }] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it('emits highlight/background color', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'h', marks: [{ type: 'highlight', value: -2130706688 }] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('background:#80ffff00;');
  });

  it('preserves consecutive spaces as &nbsp;', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'normal',
        runs: [{ text: 'a  b   c', marks: [] }],
      }],
    };
    const out = serialize(doc);
    // Consecutive spaces must emit &nbsp; per Knife withinStyle:
    // "a" + &nbsp; + " " + "b" + &nbsp; + &nbsp; + " " + "c"
    expect(out).toMatch(/&nbsp;/);
    // And it round-trips: parse back yields the original text with all spaces
    expect(parse(out).blocks[0].runs![0].text).toBe('a  b   c');
  });

  it('wraps alignment div around paragraph when aligned', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'paragraph', align: 'end',
        runs: [{ text: 'right', marks: [] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<div style="text-align:end;">right</div>');
  });

  it('puts alignment style on ul wrapper', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'bulletList', align: 'center',
        items: [[{ text: 'a', marks: [] }]],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<ul style="text-align:center;">');
  });

  it('puts alignment style on blockquote wrapper', () => {
    const doc: KnifeDoc = {
      blocks: [{
        type: 'quote', align: 'end',
        runs: [{ text: 'q', marks: [] }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<blockquote style="text-align:end;">');
  });
});

describe('Round-trip tests', () => {
  const fixtureFiles = [
    'bold-italic.html',
    'underline-strike-sub-sup.html',
    'font-size.html',
    'text-color.html',
    'background-color.html',
    'bullet.html',
    'quote.html',
    'alignment.html',
    'variants.html',
    'mixed.html',
    'entities.html',
    // Note: headings.html is NOT in the round-trip corpus because Knife
    // flattens headings to <span>+<b> on serialize, which re-parses as
    // a single inline paragraph — headings are intentionally lossy.
  ];

  for (const file of fixtureFiles) {
    it(`round-trips ${file}: canonical form is stable after double round-trip`, () => {
      const originalHtml = fixture(file);
      // First round-trip: parse → serialize → parse
      const doc1 = parse(originalHtml);
      const serialized1 = serialize(doc1);
      const doc2 = parse(serialized1);
      // Second round-trip: should produce identical result
      const serialized2 = serialize(doc2);
      const doc3 = parse(serialized2);

      // Verify stability: doc2 === doc3
      expect(doc3.blocks.length).toBe(doc2.blocks.length);
      for (let i = 0; i < doc2.blocks.length; i++) {
        expectBlockEqual(doc3.blocks[i], doc2.blocks[i]);
      }

      // Verify serialized HTML is stable
      expect(serialized2).toBe(serialized1);
    });
  }
});

/** Deep equality helper for KnifeDoc blocks. */
function expectBlockEqual(actual: import('./types').Block, expected: import('./types').Block): void {
  expect(actual.type).toBe(expected.type);
  expect(actual.align).toBe(expected.align);

  if (expected.runs) {
    expect(actual.runs).toBeDefined();
    expect(actual.runs!.length).toBe(expected.runs!.length);
    for (let i = 0; i < expected.runs!.length; i++) {
      expectRunEqual(actual.runs![i], expected.runs![i]);
    }
  }

  if (expected.items) {
    expect(actual.items).toBeDefined();
    expect(actual.items!.length).toBe(expected.items!.length);
    for (let i = 0; i < expected.items!.length; i++) {
      expect(actual.items![i].length).toBe(expected.items![i].length);
      for (let j = 0; j < expected.items![i].length; j++) {
        expectRunEqual(actual.items![i][j], expected.items![i][j]);
      }
    }
  }

  if (expected.children) {
    expect(actual.children).toBeDefined();
    expect(actual.children!.length).toBe(expected.children!.length);
    for (let i = 0; i < expected.children!.length; i++) {
      expectBlockEqual(actual.children![i], expected.children![i]);
    }
  }
}

function expectRunEqual(actual: import('./types').InlineRun, expected: import('./types').InlineRun): void {
  expect(actual.text).toBe(expected.text);
  expect(actual.marks.length).toBe(expected.marks.length);
  for (let i = 0; i < expected.marks.length; i++) {
    expect(actual.marks[i].type).toBe(expected.marks[i].type);
    if (expected.marks[i].value !== undefined) {
      expect(actual.marks[i].value).toBe(expected.marks[i].value);
    }
  }
}
