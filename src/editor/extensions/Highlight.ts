import { Mark, mergeAttributes } from '@tiptap/core';
import { knifeColorToCss } from '../knifeColor';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setKnifeHighlight: (background: string) => ReturnType;
    unsetKnifeHighlight: () => ReturnType;
  }
}

/**
 * Knife-compatible Highlight (background color) mark.
 * Emits <span style="background:#aarrggbb;"> using Knife's ARGB 8-hex format.
 */
export const KnifeHighlight = Mark.create({
  name: 'knifeHighlight',

  addAttributes() {
    return {
      background: {
        default: null,
        parseHTML: element => {
          const stored = element.getAttribute('data-knife-background');
          if (stored) return stored;
          const style = element.getAttribute('style') ?? '';
          const argb = style.match(/background\s*:\s*(#[0-9a-f]{8})/i);
          if (argb) return argb[1];
          const rgb = style.match(/background\s*:\s*(#[0-9a-f]{6})/i);
          return rgb ? `#ff${rgb[1].slice(1)}` : null;
        },
        renderHTML: attributes => {
          if (!attributes.background) return {};
          return { style: `background:${knifeColorToCss(attributes.background)};`, 'data-knife-background': attributes.background };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[style*="background"]', consuming: false }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  // @ts-expect-error -- TipTap v3 RawCommands typing
  addCommands() {
    return {
      setKnifeHighlight:
        (background: string) =>
        ({ commands }: { commands: any }) => {
          return commands.setMark(this.name, { background });
        },
      unsetKnifeHighlight:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
