import { Mark, mergeAttributes } from '@tiptap/core';
import { knifeColorToCss } from '../knifeColor';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setKnifeTextColor: (color: string) => ReturnType;
    unsetKnifeTextColor: () => ReturnType;
  }
}

/**
 * Knife-compatible TextColor mark.
 * Emits <span style="color:#aarrggbb;"> using Knife's ARGB 8-hex format.
 */
export const KnifeTextColor = Mark.create({
  name: 'knifeTextColor',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: element => {
          const stored = element.getAttribute('data-knife-color');
          if (stored) return stored;
          const style = element.getAttribute('style') ?? '';
          const argb = style.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{8})/i);
          if (argb) return argb[1];
          const rgb = style.match(/(?:^|;)\s*color\s*:\s*#([0-9a-f]{6})/i);
          return rgb ? `#ff${rgb[1]}` : null;
        },
        renderHTML: attributes => {
          if (!attributes.color) return {};
          return { style: `color:${knifeColorToCss(attributes.color)};`, 'data-knife-color': attributes.color };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[style*="color"]', consuming: false }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  // @ts-expect-error -- TipTap v3 RawCommands typing
  addCommands() {
    return {
      setKnifeTextColor:
        (color: string) =>
        ({ commands }: { commands: any }) => {
          return commands.setMark(this.name, { color });
        },
      unsetKnifeTextColor:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
