import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setKnifeFontSize: (size: number) => ReturnType;
    unsetKnifeFontSize: () => ReturnType;
  }
}

/**
 * Knife-compatible FontSize mark.
 * Emits <span style="font-size:Xem;"> where X uses Knife's 0.# format.
 */
export const KnifeFontSize = Mark.create({
  name: 'knifeFontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: element => {
          const style = element.getAttribute('style') ?? '';
          const m = style.match(/font-size\s*:\s*([\d.]+)em/);
          return m ? parseFloat(m[1]) : null;
        },
        renderHTML: attributes => {
          if (!attributes.size) return {};
          const size = attributes.size as number;
          const formatted = formatEm(size);
          return { style: `font-size:${formatted}em;` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[style*="font-size"]', consuming: false }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  // TipTap v3 RawCommands typing doesn't pick up module augmentation at compile time
  // @ts-expect-error -- commands are registered at runtime via module augmentation
  addCommands() {
    return {
      setKnifeFontSize:
        (size: number) =>
        ({ commands }: { commands: any }) => {
          return commands.setMark(this.name, { size });
        },
      unsetKnifeFontSize:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

function formatEm(value: number): string {
  if (value === Math.floor(value)) return String(value);
  const rounded = Math.round(value * 10) / 10;
  if (rounded === Math.floor(rounded)) return String(rounded);
  return rounded.toFixed(1);
}
