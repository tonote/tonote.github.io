import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { normalizeListSpacing } from './normalizeListSpacing';
import { proseMirrorDocToKnifeDoc } from './tiptapBridge';
import { serialize } from './knife/serialize';

describe('Android list spacing', () => {
  it.each([1, 2, 3])('keeps %s blank lines between lists through repeated saves', count => {
    let html = `<ul><li>first</li></ul>${'<br>\n'.repeat(count)}<ul><li>second</li><li>third</li></ul>`;
    for (let round = 0; round < 3; round++) {
      const editor = new Editor({ extensions: [StarterKit], content: normalizeListSpacing(html) });
      try {
        const blocks = editor.getJSON().content!;
        expect(blocks.map(block => block.type)).toEqual(['bulletList', ...Array(count).fill('paragraph'), 'bulletList']);
        for (const paragraph of blocks.slice(1, -1)) expect(paragraph.content).toBeUndefined();
        expect(editor.view.dom.querySelectorAll(':scope > p > br')).toHaveLength(count);
        expect(blocks.at(-1)?.content).toHaveLength(2);
        html = serialize(proseMirrorDocToKnifeDoc(editor.state.doc));
        expect(html.match(/<br>/g)).toHaveLength(count);
      } finally { editor.destroy(); }
    }
  });

  it('leaves adjacent bullets and intentional in-item breaks unchanged', () => {
    for (const html of ['<ul><li>one</li><li>two</li></ul>', '<ul><li>one<br><br>continued</li><li>two</li></ul>', '<p>text<br>next</p>']) {
      expect(normalizeListSpacing(html)).toBe(html);
    }
  });
});
