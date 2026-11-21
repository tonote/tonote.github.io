import type { TFunction } from 'i18next';
import { readChecklist } from '../domain/checkings';
import { formatEvent } from '../domain/events';
import { noteKind } from '../domain/noteKind';
import type { Note } from '../domain/types';
import { walkInline, extractAlign } from '../editor/knife/parse';
import type { Align, InlineRun } from '../editor/knife/types';
import { purifyKnifeHtml } from '../editor/sanitize';

export function noteDocument(note: Note, t: TFunction, language: string) {
  const doc = document.implementation.createHTMLDocument(note.title || t('export.untitled'));
  doc.documentElement.lang = language;
  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  doc.head.prepend(meta);
  const append = (tag: string, text: string) => {
    const el = doc.createElement(tag);
    el.textContent = text;
    doc.body.append(el);
    return el;
  };

  if (note.title) append('h1', note.title);
  switch (noteKind(note)) {
    case 'rich': {
      const body = new DOMParser().parseFromString(purifyKnifeHtml(note.content), 'text/html').body;
      for (const child of Array.from(body.childNodes)) doc.body.append(child);
      break;
    }
    case 'list':
      for (const item of readChecklist(note.content, note.checkings)) {
        const p = append('p', item.text);
        if (item.state !== 2) p.dataset.checked = String(item.state === 1);
      }
      break;
    default:
      if (note.content) append('p', note.content);
  }

  if (note.events.length) {
    append('h2', t('events.title'));
    for (const event of note.events) {
      const repeat = event.repeat;
      const date = formatEvent(event, language) || t('events.invalid');
      append('p', repeat ? date + ' · ' + t(`events.repeat_${repeat <= 4 ? repeat : 'custom'}`) : date);
    }
  }
  if (note.attachments.length) {
    append('h2', t('attachments.title'));
    for (const file of note.attachments) append('p', file.name || file.id);
  }
  return doc;
}

export interface ExportParagraph {
  runs: InlineRun[];
  prefix: string;
  heading?: 1 | 2;
  align: Align;
}

/** Knife mixes bare inline runs with HTML blocks and explicit line breaks. */
export function paragraphs(body: HTMLElement): ExportParagraph[] {
  const result: ExportParagraph[] = [];
  const structural = (node: Node | null): node is HTMLElement =>
    node instanceof HTMLElement && /^(DIV|P|UL|OL|LI|BLOCKQUOTE|H[12])$/.test(node.tagName);
  function visit(parent: HTMLElement, prefix = '', align: Align = 'normal') {
    let runs: InlineRun[] = [];
    const start = result.length;
    let itemNumber = 0;
    const flush = () => {
      if (!runs.length) return;
      const heading = parent.tagName === 'H1' ? 1 : parent.tagName === 'H2' ? 2 : undefined;
      result.push({ runs, prefix, align, heading });
      runs = [];
      prefix = '';
    };
    for (const child of Array.from(parent.childNodes)) {
      if (structural(child)) {
        flush();
        let marker = prefix;
        if (child.tagName === 'LI') {
          marker = parent.tagName === 'OL' ? `${++itemNumber}. ` : '- ';
        } else if (child.tagName === 'BLOCKQUOTE') marker = '> ';
        else if (child.dataset.checked !== undefined) marker = child.dataset.checked === 'true' ? '[x] ' : '[ ] ';
        const alignment = extractAlign(child);
        visit(child, marker, alignment === 'normal' ? align : alignment);
        prefix = '';
      } else {
        // Ignore layout whitespace around structural tags, keeping inline spaces.
        if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim() &&
            (parent.tagName === 'UL' || parent.tagName === 'OL' ||
             structural(child.previousSibling) || structural(child.nextSibling))) continue;
        walkInline(child, [], runs);
      }
    }
    flush();
    if (start === result.length && parent.tagName !== 'BODY') result.push({ runs: [], prefix, align });
  }
  visit(body);
  return result;
}

export function runStyle(run: InlineRun) {
  const mark = (type: InlineRun['marks'][number]['type']) => run.marks.find(m => m.type === type);
  const rgb = (type: 'textColor' | 'highlight') => {
    const value = mark(type)?.value;
    return typeof value === 'number' ? (value & 0xffffff).toString(16).padStart(6, '0') : undefined;
  };
  const size = Number(mark('fontSize')?.value);
  return {
    bold: !!mark('bold'), italic: !!mark('italic'), underline: !!mark('underline'), strike: !!mark('strikethrough'),
    sub: !!mark('subscript'), sup: !!mark('superscript'), link: mark('link')?.value as string | undefined,
    color: rgb('textColor'), background: rgb('highlight'), size: size > 0 && Number.isFinite(size) ? size : 1,
  };
}
