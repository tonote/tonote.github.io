import { describe, it, expect } from 'vitest';
import { noteKind } from './noteKind';
import type { Note } from './types';

const n = (checkings: string): Note => ({
  id: 'x', edited: 0, created: 0, title: '', content: '',
  notify: false, showInWidget: false,
  color: { id: 'c', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
  checkings, events: [], pinned: false, state: 0, attachments: [], priority: 0,
});

describe('noteKind', () => {
  it('classifies plain', () => expect(noteKind(n(''))).toBe('plain'));
  it('classifies rich (starts with h)', () => expect(noteKind(n('h<b>x</b>'))).toBe('rich'));
  it('classifies folder', () => expect(noteKind(n('f'))).toBe('folder'));
  it('classifies list (digits)', () => expect(noteKind(n('010'))).toBe('list'));
  it('regression: full word "html..." is still rich (Android writes "h", not "html")',
    () => expect(noteKind(n('html<b>x</b>'))).toBe('rich'));
});
