import type { TFunction } from 'i18next';
import type { Note } from '../domain/types';
import { knifeColorToCss } from '../editor/knifeColor';
import { noteDocument, paragraphs, runStyle } from './document';
import type { InlineRun } from '../editor/knife/types';

export const formats = ['pdf', 'docx', 'html', 'md', 'txt'] as const;
export type ExportFormat = typeof formats[number];

function markdownRun(run: InlineRun): string {
  const style = runStyle(run);
  let text = run.text.replace(/([\\`*_{}\[\]<>#!|~])/g, '\\$1').replace(/\n/g, '  \n');
  if (style.bold) text = `**${text}**`;
  if (style.italic) text = `_${text}_`;
  if (style.strike) text = `~~${text}~~`;
  if (style.underline) text = `<u>${text}</u>`;
  if (style.sub) text = `<sub>${text}</sub>`;
  if (style.sup) text = `<sup>${text}</sup>`;
  if (style.link) text = `[${text}](<${style.link.replace(/[<>\s\\]/g, encodeURIComponent)}>)`;
  return text;
}

function htmlFile(doc: Document) {
  // Keep only the local formatting properties used by Knife in the standalone file.
  for (const el of doc.querySelectorAll<HTMLElement>('[style]')) {
    const declarations = (el.getAttribute('style') || '').split(';');
    el.removeAttribute('style');
    for (const declaration of declarations) {
      const [key, value] = declaration.trim().toLowerCase().split(/\s*:\s*/);
      if (/^(color|background|background-color)$/.test(key) && /^#[\da-f]{6}(?:[\da-f]{2})?$/.test(value)) {
        el.style.setProperty(key, knifeColorToCss(value));
      } else if (key === 'font-size' && /^[\d.]+em$/.test(value) ||
                 key === 'text-align' && /^(left|right|start|end|center)$/.test(value)) {
        el.style.setProperty(key, value);
      }
    }
  }
  for (const p of doc.querySelectorAll<HTMLElement>('[data-checked]')) {
    p.prepend(p.dataset.checked === 'true' ? '☑ ' : '☐ ');
    delete p.dataset.checked;
  }
  const style = doc.createElement('style');
  style.textContent = 'body{max-width:48rem;margin:2rem auto;padding:0 1rem;font:1rem/1.5 system-ui,sans-serif;overflow-wrap:anywhere;white-space:pre-wrap}';
  doc.head.append(style);
  return new Blob(['<!doctype html>\n', doc.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
}

export async function exportFile(note: Note, format: ExportFormat, t: TFunction, language: string): Promise<Blob> {
  const doc = noteDocument(note, t, language);
  if (format === 'html') return htmlFile(doc);
  const blocks = paragraphs(doc.body);
  if (format === 'pdf') return (await import('./pdf')).pdfFile(doc.title, blocks);
  if (format === 'docx') return (await import('./word')).wordFile(doc.title, blocks);

  const md = format === 'md';
  const lines = blocks.map(({ runs, prefix, heading }, index) => {
    const text = runs.map(run => md ? markdownRun(run) : run.text).join('');
    const next = blocks[index + 1];
    const separate = next && (heading || (md && (!prefix || !next.prefix)));
    const hardBreak = md && next && prefix.startsWith('[') && !separate;
    const ending = separate ? '\n' : hardBreak ? '  ' : '';
    return (md && heading ? '#'.repeat(heading) + ' ' : '') + prefix + text + ending;
  });
  return new Blob([lines.join('\n')], { type: (md ? 'text/markdown' : 'text/plain') + ';charset=utf-8' });
}

export function downloadFile(blob: Blob, title: string, format: ExportFormat, fallback: string) {
  const safe = title.replace(/[<>:"/\\|?*\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const stem = [...safe].slice(0, 60).join('').replace(/[. ]+$/, '') || fallback;
  const link = document.createElement('a');
  link.download = (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? '_' : '') + stem + '.' + format;
  link.href = URL.createObjectURL(blob);
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    const url = link.href;
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
