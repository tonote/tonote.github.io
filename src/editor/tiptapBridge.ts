import type { Node as PmNode } from '@tiptap/pm/model';
import type { KnifeDoc, Block, InlineRun, InlineMark, Align } from './knife/types';

/** Convert a ProseMirror document, preserving node types and inline marks. */
export function proseMirrorDocToKnifeDoc(doc: PmNode): KnifeDoc {
  const blocks: Block[] = [];
  doc.forEach((child) => convertNode(child, blocks));
  return { blocks };
}

function childrenOf(node: PmNode): PmNode[] {
  const children: PmNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function convertNode(node: PmNode, blocks: Block[]): void {
  const type = node.type.name;
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;

  switch (type) {
    case 'paragraph': {
      const align = parseAlign(attrs.textAlign as string | undefined);
      const runs = extractRunsFromNode(node);
      blocks.push({ type: 'paragraph', align, runs });
      break;
    }
    case 'bulletList':
    case 'orderedList': {
      const align = parseAlign(attrs.textAlign as string | undefined);
      const items: InlineRun[][] = [];
      for (const li of childrenOf(node)) {
        const runs: InlineRun[] = [];
        for (const child of childrenOf(li)) {
          extractRunsFromNodeInto(child, runs);
        }
        items.push(runs);
      }
      blocks.push({ type: 'bulletList', align, items });
      break;
    }
    case 'blockquote': {
      const align = parseAlign(attrs.textAlign as string | undefined);
      const runs = extractRunsFromNode(node);
      blocks.push({ type: 'quote', align, runs });
      break;
    }
    default: {
      const runs = extractRunsFromNode(node);
      if (runs.length > 0) {
        blocks.push({ type: 'paragraph', align: 'normal', runs });
      }
      break;
    }
  }
}

function extractRunsFromNode(node: PmNode): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const child of childrenOf(node)) {
    extractRunsFromNodeInto(child, runs);
  }
  return runs;
}

function extractRunsFromNodeInto(node: PmNode, runs: InlineRun[]): void {
  if (node.type.name === 'hardBreak') {
    runs.push({ text: '\n', marks: [] });
  } else if (node.isText) {
    const marks: InlineMark[] = convertMarks(node.marks);
    runs.push({ text: node.text ?? '', marks });
  } else {
    for (const child of childrenOf(node)) {
      extractRunsFromNodeInto(child, runs);
    }
  }
}

function convertMarks(marks: readonly { type: { name: string }; attrs?: Record<string, unknown> }[]): InlineMark[] {
  const result: InlineMark[] = [];
  for (const mark of marks) {
    const name = mark.type.name;
    const attrs = mark.attrs ?? {};

    switch (name) {
      case 'bold':
        result.push({ type: 'bold' });
        break;
      case 'italic':
        result.push({ type: 'italic' });
        break;
      case 'underline':
        result.push({ type: 'underline' });
        break;
      case 'strike':
        result.push({ type: 'strikethrough' });
        break;
      case 'subscript':
        result.push({ type: 'subscript' });
        break;
      case 'superscript':
        result.push({ type: 'superscript' });
        break;
      case 'link':
        result.push({ type: 'link', value: (attrs.href as string) ?? '' });
        break;
      case 'knifeFontSize':
        result.push({ type: 'fontSize', value: attrs.size as number });
        break;
      case 'knifeTextColor':
        result.push({ type: 'textColor', value: hexToInt(attrs.color as string) });
        break;
      case 'knifeHighlight':
        result.push({ type: 'highlight', value: hexToInt(attrs.background as string) });
        break;
    }
  }
  return result;
}

function parseAlign(value: string | undefined): Align {
  if (value === 'left' || value === 'start') return 'start';
  if (value === 'right' || value === 'end') return 'end';
  if (value === 'center') return 'center';
  return 'normal';
}

/** Convert a Knife hex color string (#aarrggbb) to a signed int32. */
function hexToInt(hex: string | null | undefined): number {
  if (!hex || !hex.startsWith('#')) return -1;
  const val = parseInt(hex.slice(1), 16);
  return val | 0;
}
