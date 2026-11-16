import type { Note } from './types';
import { noteKind } from './noteKind';

/**
 * Extract visible HTML text, decoding entities and preserving word boundaries.
 * Inline formatting must not split a word; block boundaries must not join words.
 */
export function stripHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const blocks = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const text = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(node.tagName)) return '';
    const content = Array.from(node.childNodes, text).join('');
    return blocks.has(node.tagName) ? ` ${content} ` : content;
  };
  return text(document.body).replace(/\s+/g, ' ').trim();
}

/**
 * Search notes by title + content.
 *
 * Encrypted notes: if `note.iv` is set AND `opts.unlockedKey` is null, the note
 * is skipped (locked). Decryption is the caller's responsibility (e.g., the repo
 * layer decrypts before returning notes to the UI). When `opts.unlockedKey` is
 * provided, the caller has already decrypted the notes, so searchNotes just
 * checks the key is not null.
 */
export function searchNotes(
  notes: Note[],
  query: string,
  opts: { unlockedKey: Uint8Array | null },
): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: Note[] = [];
  for (const note of notes) {
    // Skip encrypted notes when locked (no key available)
    if (note.iv !== undefined && opts.unlockedKey === null) {
      continue;
    }

    const content = noteKind(note) === 'rich' ? stripHtml(note.content) : note.content;
    const haystack = (note.title + '\n' + content).toLowerCase();
    if (haystack.includes(q)) {
      results.push(note);
    }
  }

  return results;
}
