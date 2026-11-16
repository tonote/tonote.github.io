import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './database.js';
import type { Note, Color } from '../domain/types.js';
import type { Settings } from './database.js';
import { accessStore } from '../state/accessStore';

const EMPTY_NOTES: Note[] = [];

export interface UseNotesOpts {
  parentId?: string | null;
  state?: number;
  colorId?: string;
  sort?: Settings['sortOrder'];
}

function sortNotes(notes: Note[], sort?: Settings['sortOrder']): Note[] {
  const sorted = [...notes];

  // Always: pinned first, then by sort criteria
  sorted.sort((a, b) => {
    // Pinned notes come first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    // Then by sort order
    switch (sort) {
      case 'created':
        return b.created - a.created; // newest first
      case 'priority':
        return b.priority - a.priority; // highest priority first
      case 'modified':
      default:
        return b.edited - a.edited; // newest first
    }
  });

  return sorted;
}

export function useNotes(opts: UseNotesOpts = {}): { notes: Note[]; loading: boolean } {
  const { parentId, state, colorId, sort } = opts;
  const mode = accessStore(s => s.mode);

  const result = useLiveQuery(async () => {
    const table = mode === 'readwrite' ? db.notes : db.backupNotes;
    let result: Note[];

    if (state !== undefined) {
      result = await table.where('state').equals(state).toArray();
    } else {
      result = await table.toArray();
    }

    // Parent and state are independent filters (including active folder contents).
    if (parentId === null) {
      result = result.filter(n => n.parentId == null);
    } else if (parentId !== undefined) {
      result = result.filter(n => n.parentId === parentId);
    }

    if (colorId !== undefined) {
      result = result.filter((n) => n.color?.id === colorId);
    }

    return { mode, notes: sortNotes(result, sort) };
  }, [parentId, state, colorId, sort, mode]);

  return { notes: result?.mode === mode ? result.notes : EMPTY_NOTES, loading: result?.mode !== mode };
}

export function useNote(id: string | undefined): { note: Note | undefined; loading: boolean } {
  const mode = accessStore(s => s.mode);
  // useLiveQuery returns undefined before first resolution, which is
  // indistinguishable from a DB query that resolves to undefined (not found).
  // Wrap the note and its mode to distinguish loading, missing and stale results.
  const result = useLiveQuery(
    async () => {
      const note = id === undefined ? undefined : await (mode === 'readwrite' ? db.notes : db.backupNotes).get(id);
      return { mode, note };
    },
    [id, mode],
  );

  if (result === undefined || result.mode !== mode) {
    return { note: undefined, loading: true };
  }
  return { note: result.note, loading: false };
}

export function useColors(): { colors: Color[]; loading: boolean } {
  const mode = accessStore(s => s.mode);
  const result = useLiveQuery(async () => ({ mode, colors: await (mode === 'readwrite' ? db.colors : db.backupColors).orderBy('priority').reverse().toArray() }), [mode]);

  return { colors: result?.mode === mode ? result.colors : [], loading: result?.mode !== mode };
}
