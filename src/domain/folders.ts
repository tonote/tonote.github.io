import type { Note } from './types';
import { NOTE_STATE } from './types';

/** Returns the set of descendant note ids (transitive children) of `folderId`. */
export function listDescendantIds(folderId: string, notes: Note[]): Set<string> {
  const result = new Set<string>();
  const stack = [folderId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const n of notes) {
      if (n.parentId === current && !result.has(n.id)) {
        result.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return result;
}

/** Is `candidateDescendantId` a descendant of `ancestorId`? */
export function isDescendant(
  candidateDescendantId: string,
  ancestorId: string,
  notes: Note[],
): boolean {
  return listDescendantIds(ancestorId, notes).has(candidateDescendantId);
}

/**
 * Compute the state changes for cascading a folder's state transition to its descendants.
 * Returns a map of noteId -> new state for notes whose state changes.
 */
export function computeCascade(
  folderId: string,
  folderNewState: number,
  notes: Note[],
): Map<string, number> {
  const changes = new Map<string, number>();
  const descendants = listDescendantIds(folderId, notes);

  const noteMap = new Map(notes.map(n => [n.id, n]));

  for (const id of descendants) {
    const note = noteMap.get(id);
    if (!note) continue;

    if (folderNewState === NOTE_STATE.REMOVED) {
      // Trash: descendants that are NONE or ARCHIVED → PARENT_REMOVED
      if (note.state === NOTE_STATE.NONE || note.state === NOTE_STATE.ARCHIVED) {
        changes.set(id, NOTE_STATE.PARENT_REMOVED);
      }
      // Already REMOVED or PARENT_REMOVED → not touched
    } else if (folderNewState === NOTE_STATE.NONE) {
      // Restore: descendants that are PARENT_REMOVED → NONE
      if (note.state === NOTE_STATE.PARENT_REMOVED) {
        changes.set(id, NOTE_STATE.NONE);
      }
    }
  }

  return changes;
}

/** Can `noteId` be moved into `targetFolderId` without creating a cycle? */
export function canMoveTo(noteId: string, targetFolderId: string, notes: Note[]): boolean {
  if (noteId === targetFolderId) return false;
  return !isDescendant(targetFolderId, noteId, notes);
}
