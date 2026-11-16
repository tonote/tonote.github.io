import type { InlineMark, InlineRun, Block, KnifeDoc } from './types';

/** Serialize a KnifeDoc to Knife-compatible HTML. */
export function serialize(doc: KnifeDoc): string {
  return doc.blocks.map((block, index) => {
    if (block.type === 'paragraph' && !(block.runs ?? []).some(run => run.text)) {
      // Preserve empty list separators when saving the editor's empty paragraphs.
      let before = index - 1;
      let after = index + 1;
      const empty = (item: Block) => item.type === 'paragraph' && !(item.runs ?? []).some(run => run.text);
      while (before >= 0 && empty(doc.blocks[before])) before--;
      while (after < doc.blocks.length && empty(doc.blocks[after])) after++;
      if (doc.blocks[before]?.type === 'bulletList' && doc.blocks[after]?.type === 'bulletList') return '<br>';
    }
    return serializeBlock(block);
  }).join('\n');
}

function serializeBlock(block: Block): string {
  const content = serializeBlockContent(block);

  switch (block.type) {
    case 'paragraph': {
      if (block.align === 'normal') return content;
      return `<div style="text-align:${block.align};">${content}</div>`;
    }
    case 'bulletList': {
      if (block.align === 'normal') return content;
      // Re-render with styled ul
      const items = (block.items ?? []).map(
        item => `<li>${item.map(serializeRun).join('')}</li>`
      ).join('\n');
      return `<ul style="text-align:${block.align};">\n${items}\n</ul>`;
    }
    case 'quote': {
      if (block.align === 'normal') return content;
      const inner = (block.runs ?? []).map(serializeRun).join('');
      return `<blockquote style="text-align:${block.align};">${inner}</blockquote>`;
    }
    default:
      return content;
  }
}

function serializeBlockContent(block: Block): string {
  switch (block.type) {
    case 'bulletList': {
      const items = (block.items ?? []).map(
        item => `<li>${item.map(serializeRun).join('')}</li>`
      ).join('\n');
      return `<ul>\n${items}\n</ul>`;
    }
    case 'quote': {
      return `<blockquote>${(block.runs ?? []).map(serializeRun).join('')}</blockquote>`;
    }
    case 'paragraph': {
      return (block.runs ?? []).map(serializeRun).join('');
    }
    default:
      return '';
  }
}

function serializeRun(run: InlineRun): string {
  const escaped = escapeText(run.text);
  if (run.marks.length === 0) return escaped;
  return wrapWithMarks(escaped, run.marks);
}

/** Wrap text with the appropriate HTML tags for each mark. */
function wrapWithMarks(text: string, marks: InlineMark[]): string {
  let result = text;

  // Process marks from last to first so nesting is correct
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    switch (mark.type) {
      case 'bold':
        result = `<b>${result}</b>`;
        break;
      case 'italic':
        result = `<i>${result}</i>`;
        break;
      case 'underline':
        result = `<u>${result}</u>`;
        break;
      case 'strikethrough':
        result = `<del>${result}</del>`;
        break;
      case 'subscript':
        result = `<sub>${result}</sub>`;
        break;
      case 'superscript':
        result = `<sup>${result}</sup>`;
        break;
      case 'link':
        result = `<a href="${escapeAttr(mark.value as string)}">${result}</a>`;
        break;
      case 'fontSize': {
        const size = formatEm(mark.value as number);
        result = `<span style="font-size:${size}em;">${result}</span>`;
        break;
      }
      case 'textColor': {
        const color = formatArgbHex(mark.value as number);
        result = `<span style="color:${color};">${result}</span>`;
        break;
      }
      case 'highlight': {
        const bg = formatArgbHex(mark.value as number);
        result = `<span style="background:${bg};">${result}</span>`;
        break;
      }
    }
  }

  return result;
}

/** Format a font-size value to the Knife em format: "1.5", "2", "0.8" (max 1 decimal, no trailing .0).
 *  Mirrors Java's String.format("%.1f", value) behavior. */
export function formatEm(value: number): string {
  if (value === Math.floor(value)) return String(value);
  // Round to 1 decimal place using Java-style rounding (half-up)
  const rounded = Math.round(value * 10) / 10;
  // Format: if it's now an integer, no decimal; otherwise show 1 decimal
  if (rounded === Math.floor(rounded)) return String(rounded);
  // Use toFixed(1) and strip trailing zeros (but since we know it has a fractional part, it'll be X.Y)
  return rounded.toFixed(1);
}

/** Format a signed ARGB int32 to Knife's 8-hex lowercase string: #aarrggbb. */
export function formatArgbHex(value: number): string {
  return '#' + (value >>> 0).toString(16).padStart(8, '0');
}

/** Escape text per Knife's withinStyle rules: < > & → entities, \n → <br>, consecutive spaces → &nbsp;. */
export function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    // Knife withinStyle: each space followed by another space → &nbsp;
    .replace(/ (?= )/g, '&nbsp;');
}

/** Escape an attribute value. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
