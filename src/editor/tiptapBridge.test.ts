import { describe, it, expect } from 'vitest';
import { proseMirrorDocToKnifeDoc } from './tiptapBridge';
import { Schema, type Node } from '@tiptap/pm/model';

// Real ProseMirror nodes catch JSON/Fragment mismatches that structural mocks miss.
const schema = new Schema({
  nodes: {
    doc: { content: 'block*' },
    paragraph: { group: 'block', content: 'inline*', attrs: { textAlign: { default: null } } },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline' },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph+' },
    blockquote: { group: 'block', content: 'paragraph+' },
  },
  marks: {
    bold: {},
    link: { attrs: { href: {} } },
    knifeFontSize: { attrs: { size: {} } },
    knifeTextColor: { attrs: { color: {} } },
  },
});
function textNode(text: string, marks: { type: { name: string }; attrs?: Record<string, unknown> }[] = []): Node {
  return schema.text(text, marks.map((mark) => schema.mark(mark.type.name, mark.attrs)));
}
function mockNode(typeName: string, attrs: Record<string, unknown> = {}, content?: Node[]): Node {
  return schema.node(typeName, attrs, content);
}

describe('tiptapBridge', () => {
  it('converts a simple paragraph with bold text', () => {
    const doc = mockNode('doc', {}, [
      mockNode('paragraph', {}, [
        textNode('hello ', []),
        textNode('world', [{ type: { name: 'bold' } }]),
      ]),
    ]);

    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    expect(knifeDoc.blocks.length).toBe(1);
    expect(knifeDoc.blocks[0].type).toBe('paragraph');
    const runs = knifeDoc.blocks[0].runs!;
    expect(runs[0].text).toBe('hello ');
    expect(runs[0].marks.length).toBe(0);
    expect(runs[1].text).toBe('world');
    expect(runs[1].marks).toContainEqual({ type: 'bold' });
  });

  it('converts bullet list', () => {
    const doc = mockNode('doc', {}, [
      mockNode('bulletList', {}, [
        mockNode('listItem', {}, [
          mockNode('paragraph', {}, [textNode('item 1')]),
        ]),
        mockNode('listItem', {}, [
          mockNode('paragraph', {}, [textNode('item 2')]),
        ]),
      ]),
    ]);

    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    expect(knifeDoc.blocks.length).toBe(1);
    expect(knifeDoc.blocks[0].type).toBe('bulletList');
    expect(knifeDoc.blocks[0].items!.length).toBe(2);
    expect(knifeDoc.blocks[0].items![0][0].text).toBe('item 1');
    expect(knifeDoc.blocks[0].items![1][0].text).toBe('item 2');
  });

  it('converts blockquote', () => {
    const doc = mockNode('doc', {}, [
      mockNode('blockquote', {}, [
        mockNode('paragraph', {}, [textNode('quoted text')]),
      ]),
    ]);

    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    expect(knifeDoc.blocks.length).toBe(1);
    expect(knifeDoc.blocks[0].type).toBe('quote');
    expect(knifeDoc.blocks[0].runs![0].text).toBe('quoted text');
  });

  it('converts link marks', () => {
    const doc = mockNode('doc', {}, [
      mockNode('paragraph', {}, [
        textNode('click', [{ type: { name: 'link' }, attrs: { href: 'https://example.com' } }]),
      ]),
    ]);

    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    const mark = knifeDoc.blocks[0].runs![0].marks[0];
    expect(mark.type).toBe('link');
    expect(mark.value).toBe('https://example.com');
  });

  it('converts Knife font size', () => {
    const doc = mockNode('doc', {}, [
      mockNode('paragraph', {}, [
        textNode('big', [{ type: { name: 'knifeFontSize' }, attrs: { size: 1.5 } }]),
      ]),
    ]);

    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    const mark = knifeDoc.blocks[0].runs![0].marks[0];
    expect(mark.type).toBe('fontSize');
    expect(mark.value).toBe(1.5);
  });

  it('converts Knife text color', () => {
    const doc = mockNode('doc', {}, [
      mockNode('paragraph', {}, [
        textNode('colored', [{ type: { name: 'knifeTextColor' }, attrs: { color: '#fff9f9f9' } }]),
      ]),
    ]);

    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    const mark = knifeDoc.blocks[0].runs![0].marks[0];
    expect(mark.type).toBe('textColor');
    expect(mark.value).toBe(-394759);
  });

  it('converts alignment attrs', () => {
    const doc = mockNode('doc', {}, [
      mockNode('paragraph', { textAlign: 'center' }, [textNode('centered')]),
    ]);

    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    expect(knifeDoc.blocks[0].align).toBe('center');
  });

  it('handles empty document', () => {
    const doc = mockNode('doc', {});
    const knifeDoc = proseMirrorDocToKnifeDoc(doc);
    expect(knifeDoc.blocks).toEqual([]);
  });
});

it('preserves a hard line break from the actual editor document', () => {
  const doc = schema.node('doc', null, schema.node('paragraph', null, [schema.text('one'), schema.node('hardBreak'), schema.text('two')]));
  expect(proseMirrorDocToKnifeDoc(doc).blocks[0].runs?.map((run) => run.text).join('')).toBe('one\ntwo');
});
