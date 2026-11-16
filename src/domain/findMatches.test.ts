import { describe, expect, it } from 'vitest';
import { findMatches, searchExcerpt } from './findMatches';
import { createNoteDraft, hasNoteContent } from './noteDraft';

describe('literal search matches', () => {
  it('finds all case-insensitive Cyrillic matches', () => {
    expect(findMatches('Заметка и заметка', 'заметка')).toEqual([{ from: 0, to: 7 }, { from: 10, to: 17 }]);
  });
  it('treats regex syntax as literal text', () => {
    expect(findMatches('a [x].* b [x].*', '[x].*')).toEqual([{ from: 2, to: 7 }, { from: 10, to: 15 }]);
    expect(findMatches('abc', ' ')).toEqual([]);
  });
  it('keeps a match beyond the normal preview visible', () => {
    const excerpt = searchExcerpt('prefix '.repeat(100) + 'needle' + ' tail'.repeat(100), 'needle');
    expect(excerpt).toContain('needle');
    expect(excerpt.length).toBeLessThan(300);
  });
});

it('does not treat empty rich markup or whitespace as note content', () => {
  const note = createNoteDraft('rich');
  expect(hasNoteContent({ ...note, content: '<p><br></p><p>&nbsp;</p>' })).toBe(false);
  expect(hasNoteContent({ ...note, content: '<p>text</p>' })).toBe(true);
  expect(hasNoteContent({ ...note, title: 'Title' })).toBe(true);
});
