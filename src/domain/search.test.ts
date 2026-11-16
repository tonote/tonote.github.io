import { describe, it, expect } from 'vitest';
import { searchNotes } from './search';
import type { Note, Color } from './types';

const defaultColor: Color = {
  id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0,
};

const makeNote = (id: string, overrides?: Partial<Note>): Note => ({
  id,
  edited: Date.now(),
  created: Date.now(),
  title: 'Test Note',
  content: 'Hello world',
  notify: false,
  showInWidget: false,
  color: defaultColor,
  checkings: '',
  events: [],
  pinned: false,
  state: 0,
  attachments: [],
  priority: 0,
  ...overrides,
});

describe('searchNotes', () => {
  it('returns empty array for empty query', () => {
    const notes = [makeNote('n1', { title: 'Hello' })];
    expect(searchNotes(notes, '   ', { unlockedKey: null })).toEqual([]);
    expect(searchNotes(notes, '', { unlockedKey: null })).toEqual([]);
  });

  it('matches title case-insensitively', () => {
    const notes = [makeNote('n1', { title: 'Hello World', content: '' })];
    const results = searchNotes(notes, 'hello', { unlockedKey: null });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('n1');
  });

  it('matches content case-insensitively', () => {
    const notes = [makeNote('n1', { title: '', content: 'Hello World' })];
    const results = searchNotes(notes, 'world', { unlockedKey: null });
    expect(results).toHaveLength(1);
  });

  it('matches across title and content', () => {
    const notes = [
      makeNote('n1', { title: 'Alpha', content: 'Beta Gamma' }),
      makeNote('n2', { title: 'Delta', content: 'Epsilon Zeta' }),
    ];
    const results = searchNotes(notes, 'beta', { unlockedKey: null });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('n1');
  });

  it('strips HTML from rich content before matching', () => {
    const notes = [
      makeNote('n1', {
        title: '',
        content: '<p>Hello <strong>World</strong></p>',
        checkings: 'h',
      }),
    ];
    const results = searchNotes(notes, 'hello world', { unlockedKey: null });
    expect(results).toHaveLength(1);
  });

  it('strips &nbsp; from content', () => {
    const notes = [
      makeNote('n1', {
        title: '',
        content: 'Hello&nbsp;World',
        checkings: 'h',
      }),
    ];
    const results = searchNotes(notes, 'hello world', { unlockedKey: null });
    expect(results).toHaveLength(1);
  });

  it('excludes encrypted+locked notes (iv set, key null)', () => {
    const notes = [
      makeNote('n1', { title: 'Secret', content: 'Encrypted data', iv: 'somebase64iv' }),
    ];
    const results = searchNotes(notes, 'secret', { unlockedKey: null });
    expect(results).toHaveLength(0);
  });

  it('includes encrypted notes when key is provided (unlocked)', () => {
    // When unlocked, caller passes decrypted notes. searchNotes just checks
    // that the key is not null — it doesn't do decryption itself.
    const unlockedKey = new Uint8Array([1, 2, 3]);
    const notes = [
      makeNote('n1', { title: 'Decrypted Secret', content: 'Now visible', iv: 'somebase64iv' }),
    ];
    const results = searchNotes(notes, 'decrypted', { unlockedKey });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('n1');
  });

  it('returns empty when no notes match', () => {
    const notes = [makeNote('n1', { title: 'Foo', content: 'Bar' })];
    const results = searchNotes(notes, 'xyz', { unlockedKey: null });
    expect(results).toHaveLength(0);
  });

  it('handles non-encrypted notes without iv correctly', () => {
    const notes = [
      makeNote('n1', { title: 'Plain', content: 'Note', iv: undefined }),
      makeNote('n2', { title: 'Plain 2', content: 'Note 2' }),
    ];
    const results = searchNotes(notes, 'plain', { unlockedKey: null });
    expect(results).toHaveLength(2);
  });

  it('collapses whitespace from stripped HTML', () => {
    const notes = [
      makeNote('n1', {
        title: '',
        content: '<div>Hello</div><div>World</div>',
        checkings: 'h',
      }),
    ];
    const results = searchNotes(notes, 'hello world', { unlockedKey: null });
    expect(results).toHaveLength(1);
  });
});

it('finds decoded Android entities and words split by inline styles', () => {
  const note = makeNote('rich', { title: '', checkings: 'h', content: '<b>&#1055;&#1088;&#1080;</b><i>&#x432;&#x435;&#x442;</i>&nbsp;&amp; мир' });
  expect(searchNotes([note], 'привет & мир', { unlockedKey: null })).toEqual([note]);
  expect(searchNotes([note], '1055', { unlockedKey: null })).toEqual([]);
});

it('separates list items and ignores invisible HTML metadata', () => {
  const note = makeNote('rich', { title: '', checkings: 'h', content: '<ul><li>первый</li><li>второй</li></ul><script>hidden</script><a href="https://secret.example">ссылка</a>' });
  expect(searchNotes([note], 'первый второй', { unlockedKey: null })).toEqual([note]);
  expect(searchNotes([note], 'hidden', { unlockedKey: null })).toEqual([]);
  expect(searchNotes([note], 'secret.example', { unlockedKey: null })).toEqual([]);
});

it('searches plain text literally without interpreting tags or entities', () => {
  const note = makeNote('plain', { title: '', content: 'Use <tag> and &amp;' });
  expect(searchNotes([note], '<tag>', { unlockedKey: null })).toEqual([note]);
  expect(searchNotes([note], '&amp;', { unlockedKey: null })).toEqual([note]);
});
