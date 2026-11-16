export interface TextMatch { from: number; to: number; }

/** Literal, case-insensitive matches; offsets remain valid for the original text. */
export function findMatches(text: string, query: string): TextMatch[] {
  const needle = query.trim();
  if (!needle) return [];
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  return Array.from(text.matchAll(pattern), (match) => ({ from: match.index, to: match.index + match[0].length }));
}

export function searchExcerpt(text: string, query: string): string {
  const first = findMatches(text, query)[0];
  if (!first) return text;
  const start = Math.max(0, first.from - 70);
  const end = Math.min(text.length, first.to + 180);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
