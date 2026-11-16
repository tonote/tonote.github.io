import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { db } from './database.js';
import { notesRepo } from './notesRepo.js';
import type { Note } from '../domain/types.js';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const makeNote = (id: string, overrides?: Partial<Note>): Note => ({
  id,
  edited: Date.now(),
  created: Date.now(),
  title: `Note ${id}`,
  content: '',
  notify: false,
  showInWidget: false,
  color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
  checkings: '',
  events: [],
  pinned: false,
  state: 0,
  attachments: [],
  priority: 0,
  ...overrides,
});

describe('useNote', () => {
  it('returns loading=true initially, then the note', async () => {
    const note = makeNote('n1', { title: 'Test Note' });
    await notesRepo.put(note);

    const { useNote } = await import('./useNote.js');
    const { result } = renderHook(() => useNote('n1'));

    // Initially loading
    expect(result.current.loading).toBe(true);

    // After liveQuery resolves
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.note).toBeDefined();
    expect(result.current.note!.title).toBe('Test Note');
  });

  it('re-renders when note is updated', async () => {
    const note = makeNote('n1', { title: 'Original' });
    await notesRepo.put(note);

    const { useNote } = await import('./useNote.js');
    const { result } = renderHook(() => useNote('n1'));

    await waitFor(() => {
      expect(result.current.note?.title).toBe('Original');
    });

    // Update the note
    await notesRepo.put(makeNote('n1', { title: 'Updated', edited: Date.now() + 1 }));

    await waitFor(() => {
      expect(result.current.note?.title).toBe('Updated');
    });
  });

  it('returns note=undefined for non-existent id', async () => {
    const { useNote } = await import('./useNote.js');
    const { result } = renderHook(() => useNote('nonexistent'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.note).toBeUndefined();
  });
});

describe('useNotes list filters', () => {
  it.each([
    [{ state: 0 }, ['active-child', 'active-root']],
    [{ state: 0, parentId: null }, ['active-root']],
    [{ state: 0, parentId: 'folder' }, ['active-child']],
    [{ state: 0, colorId: 'c1' }, ['active-child', 'active-root']],
    [{ state: 1 }, ['archived-child', 'archived-root']],
    [{ state: 2 }, ['trashed-child', 'trashed-root']],
  ])('combines filters %j', async (opts, expected) => {
    for (const [label, state] of [['active', 0], ['archived', 1], ['trashed', 2], ['parent-removed', 3]] as const) {
      await notesRepo.put(makeNote(`${label}-root`, { state, checkings: 'f' }));
      await notesRepo.put(makeNote(`${label}-child`, { state, parentId: 'folder' }));
    }
    const { useNotes } = await import('./useNotes');
    const { result } = renderHook(() => useNotes(opts));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notes.map(n => n.id).sort()).toEqual(expected);
  });
});
