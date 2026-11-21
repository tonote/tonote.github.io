import type { Align, InlineMark, InlineRun, Block, KnifeDoc } from './types';

/** Parse an HTML string (Knife vocabulary) into a KnifeDoc. */
export function parse(html: string): KnifeDoc {
  if (!html.trim()) return { blocks: [] };

  const parser = new DOMParser();
  const doc = parser.parseFromString(wrapHtml(html), 'text/html');
  const body = doc.body;

  const blocks: Block[] = [];
  walkBlockNodes(body, blocks);
  return { blocks };
}

/** Wrap in minimal HTML so DOMParser creates a proper body. */
function wrapHtml(html: string): string {
  return `<html><body>${html}</body></html>`;
}

/** Tags that are block-level and should create new blocks. */
const BLOCK_TAGS = new Set(['ul', 'ol', 'blockquote', 'div', 'p', 'br', 'table',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Check if a tag is block-level. */
function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

/** Walk top-level children of a container, producing blocks.
 *  Groups consecutive inline elements + text nodes into single paragraph blocks.
 *  Whitespace-only text nodes between block-level elements are treated as block separators. */
function walkBlockNodes(parent: Element, blocks: Block[]): void {
  let pendingRuns: InlineRun[] = [];

  const flushPending = (): void => {
    if (pendingRuns.length > 0) {
      const trimmed = trimRuns(pendingRuns);
      if (trimmed.length > 0) {
        blocks.push({ type: 'paragraph', align: 'normal', runs: trimmed });
      }
      pendingRuns = [];
    }
  };

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (!text) continue;
      // If we have no pending content and this is whitespace-only, it's a block separator
      if (pendingRuns.length === 0 && text.trim() === '') {
        continue;
      }
      walkInline(child, [], pendingRuns);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (isBlockTag(tag)) {
      flushPending();

      switch (tag) {
        case 'ul': {
          const align = extractAlign(el);
          const items = parseListItems(el);
          blocks.push({ type: 'bulletList', align, items });
          break;
        }
        case 'blockquote': {
          const align = extractAlign(el);
          const runs = extractRuns(el);
          blocks.push({ type: 'quote', align, runs });
          break;
        }
        case 'div': {
          const align = extractAlign(el);
          const innerUl = el.querySelector(':scope > ul');
          const innerBq = el.querySelector(':scope > blockquote');
          if (innerUl) {
            const items = parseListItems(innerUl);
            blocks.push({ type: 'bulletList', align, items });
          } else if (innerBq) {
            const runs = extractRuns(innerBq);
            blocks.push({ type: 'quote', align, runs });
          } else {
            const runs = extractRuns(el);
            blocks.push({ type: 'paragraph', align, runs });
          }
          break;
        }
        case 'p': {
          const runs = extractRuns(el);
          blocks.push({ type: 'paragraph', align: 'normal', runs });
          break;
        }
        case 'br': {
          blocks.push({ type: 'paragraph', align: 'normal', runs: [{ text: '', marks: [] }] });
          break;
        }
        default: {
          // h1-h6: heading → paragraph with fontSize + bold
          const headingMatch = tag.match(/^h([1-6])$/);
          if (headingMatch) {
            const level = parseInt(headingMatch[1], 10);
            const fontSize = [1.5, 1.4, 1.3, 1.2, 1.1, 1.0][level - 1];
            const align = extractAlign(el);
            const rawRuns = extractRuns(el);
            // Apply fontSize + bold to all runs
            const headingRuns = rawRuns.map(run => ({
              ...run,
              marks: [...run.marks, { type: 'fontSize' as const, value: fontSize }, { type: 'bold' as const }],
            }));
            blocks.push({ type: 'paragraph', align, runs: headingRuns });
          }
          // table and other unrecognized block tags — skip
          break;
        }
      }
    } else {
      // Inline element: extract runs into the pending paragraph
      walkInline(child, [], pendingRuns);
    }
  }

  flushPending();
}

/** Strip leading and trailing whitespace-only runs from a paragraph,
 *  and trim leading/trailing whitespace from boundary runs. */
function trimRuns(runs: InlineRun[]): InlineRun[] {
  let start = 0;
  while (start < runs.length && runs[start].text.trim() === '') {
    start++;
  }
  let end = runs.length;
  while (end > start && runs[end - 1].text.trim() === '') {
    end--;
  }
  const trimmed = runs.slice(start, end);
  if (trimmed.length === 0) return trimmed;

  // Trim leading whitespace from first run
  trimmed[0] = { ...trimmed[0], text: trimmed[0].text.replace(/^[\s\n]+/, '') };
  // Trim trailing whitespace from last run
  const last = trimmed.length - 1;
  trimmed[last] = { ...trimmed[last], text: trimmed[last].text.replace(/[\s\n]+$/, '') };

  return trimmed;
}

/** Parse <li> children of a <ul>. */
function parseListItems(ul: Element): InlineRun[][] {
  const items: InlineRun[][] = [];
  for (const li of Array.from(ul.querySelectorAll(':scope > li'))) {
    items.push(extractRuns(li));
  }
  return items;
}

/** Extract alignment from an element's raw style attribute. */
export function extractAlign(el: Element): Align {
  const styleStr = el.getAttribute('style') ?? '';
  const m = styleStr.match(/text-align\s*:\s*(\w[\w-]*)/);
  if (!m) return 'normal';
  const align = m[1].toLowerCase();
  if (align === 'start' || align === 'left') return 'start';
  if (align === 'end' || align === 'right') return 'end';
  if (align === 'center') return 'center';
  return 'normal';
}

/** Extract inline runs from an element, walking its text nodes and inline elements. */
function extractRuns(el: Element): InlineRun[] {
  const runs: InlineRun[] = [];
  walkInline(el, [], runs);
  return runs;
}

/** Recursively walk inline nodes, accumulating marks. */
export function walkInline(node: Node, marks: InlineMark[], runs: InlineRun[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = node.textContent ?? '';
    if (text) {
      // Normalize non-breaking spaces (&nbsp;) to regular spaces for Knife round-trip fidelity.
      text = text.replace(/\u00A0/g, ' ');
      runs.push({ text, marks: [...marks] });
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const newMarks = mergeMarks(marks, el);

  // Handle <br> within inline context — emit a line break run
  if (tag === 'br') {
    runs.push({ text: '\n', marks: [...marks] });
    return;
  }

  // Drop certain tags but process children
  if (tag === 'input' || tag === 'img' || tag === 'tt' || tag === 'font') {
    // For <font>, extract color mark
    if (tag === 'font') {
      const color = el.getAttribute('color');
      if (color) {
        const fontMarks: InlineMark[] = [...newMarks, { type: 'textColor' as const, value: colorToArgbInt(color) }];
        for (const child of Array.from(node.childNodes)) {
          walkInline(child, fontMarks, runs);
        }
        return;
      }
    }
    for (const child of Array.from(node.childNodes)) {
      walkInline(child, newMarks, runs);
    }
    return;
  }

  for (const child of Array.from(node.childNodes)) {
    walkInline(child, newMarks, runs);
  }
}

/** Given current marks and an element, produce new marks list. */
function mergeMarks(parentMarks: InlineMark[], el: Element): InlineMark[] {
  const marks = [...parentMarks];
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'b':
    case 'strong':
      addOrUpdateMark(marks, { type: 'bold' });
      break;
    case 'i':
    case 'em':
    case 'cite':
    case 'dfn':
      addOrUpdateMark(marks, { type: 'italic' });
      break;
    case 'u':
      addOrUpdateMark(marks, { type: 'underline' });
      break;
    case 'del':
    case 's':
    case 'strike':
      addOrUpdateMark(marks, { type: 'strikethrough' });
      break;
    case 'sub':
      addOrUpdateMark(marks, { type: 'subscript' });
      break;
    case 'sup':
      addOrUpdateMark(marks, { type: 'superscript' });
      break;
    case 'big':
      addOrUpdateMark(marks, { type: 'fontSize', value: 1.25 });
      break;
    case 'small':
      addOrUpdateMark(marks, { type: 'fontSize', value: 0.8 });
      break;
    case 'a': {
      const href = el.getAttribute('href');
      if (href) addOrUpdateMark(marks, { type: 'link', value: href });
      break;
    }
    case 'span': {
      extractSpanStyles(el, marks);
      break;
    }
  }

  return marks;
}

/** Extract style attributes from a <span> by parsing the raw style attribute string.
 *  jsdom normalizes 8-hex colors to rgba(), so we parse raw text to preserve Knife's ARGB format. */
function extractSpanStyles(el: Element, marks: InlineMark[]): void {
  const styleStr = el.getAttribute('style') ?? '';

  // font-size: Xem
  const fsMatch = styleStr.match(/font-size\s*:\s*([\d.]+)em/);
  if (fsMatch) {
    addOrUpdateMark(marks, { type: 'fontSize', value: parseFloat(fsMatch[1]) });
  }

  // color: #aarrggbb (Knife ARGB 8-hex)
  const colorMatch = styleStr.match(/color\s*:\s*(#[0-9a-f]{8})/i);
  if (colorMatch) {
    const val = parseInt(colorMatch[1].slice(1), 16);
    addOrUpdateMark(marks, { type: 'textColor', value: toSignedInt32(val) });
  }
  // Also accept 6-hex → full alpha
  const color6Match = styleStr.match(/color\s*:\s*(#[0-9a-f]{6})/i);
  if (color6Match && !colorMatch) {
    const rgb = parseInt(color6Match[1].slice(1), 16);
    addOrUpdateMark(marks, { type: 'textColor', value: argbToInt(0xFF, rgb) });
  }

  // background: #aarrggbb (Knife ARGB 8-hex)
  const bgMatch = styleStr.match(/background\s*:\s*(#[0-9a-f]{8})/i);
  if (bgMatch) {
    const val = parseInt(bgMatch[1].slice(1), 16);
    addOrUpdateMark(marks, { type: 'highlight', value: toSignedInt32(val) });
  }
  const bg6Match = styleStr.match(/background\s*:\s*(#[0-9a-f]{6})/i);
  if (bg6Match && !bgMatch) {
    const rgb = parseInt(bg6Match[1].slice(1), 16);
    addOrUpdateMark(marks, { type: 'highlight', value: argbToInt(0xFF, rgb) });
  }
}

/** Convert a color attribute value (like "red" or "#ff0000") to signed ARGB int32. */
function colorToArgbInt(color: string): number {
  // Try hex
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return argbToInt(0xFF, parseInt(hex[1], 16));
  }
  // For named colors or other formats, try CSS computed
  // Fallback: treat as 8-hex
  const argb = color.match(/^#([0-9a-f]{8})$/i);
  if (argb) {
    return toSignedInt32(parseInt(argb[1], 16));
  }
  return -1; // fallback
}

/** Construct ARGB int32 from alpha byte and RGB int. */
function argbToInt(alpha: number, rgb: number): number {
  const val = ((alpha & 0xFF) << 24) | (rgb & 0x00FFFFFF);
  return toSignedInt32(val);
}

/** Convert an unsigned 32-bit value to a signed int32. */
function toSignedInt32(val: number): number {
  return val | 0;
}

/** Add or update a mark of the given type in the marks array. */
function addOrUpdateMark(marks: InlineMark[], mark: InlineMark): void {
  const idx = marks.findIndex(m => m.type === mark.type);
  if (idx >= 0) {
    marks[idx] = mark;
  } else {
    marks.push(mark);
  }
}
