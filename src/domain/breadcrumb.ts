import type { Note } from './types';

/**
 * Chain from root to `folderId` inclusive, ordered root-first.
 * Empty if folderId is null or not found.
 */
export function buildBreadcrumb(folderId: string | null, notes: Note[]): Note[] {
  if (folderId === null) return [];

  const noteMap = new Map(notes.map(n => [n.id, n]));

  const chain: Note[] = [];
  let currentId: string | undefined = folderId;

  while (currentId !== undefined) {
    const note = noteMap.get(currentId);
    if (!note) break;
    chain.unshift(note);
    currentId = note.parentId;
  }

  return chain;
}

/** All notes whose parentId === folderId (direct children only). */
export function directChildren(folderId: string | null, notes: Note[]): Note[] {
  return notes.filter(n => {
    if (folderId === null) {
      // Root-level: parentId is undefined or not present
      return n.parentId === undefined || n.parentId === null;
    }
    return n.parentId === folderId;
  });
}
