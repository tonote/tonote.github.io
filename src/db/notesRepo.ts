import { db } from './database.js';
import type { Note } from '../domain/types.js';
import { assertWritable } from '../state/accessStore';

/**
 * Repository for Note entities.
 *
 * Root-folder queries: `byParent(null)` fetches all notes and filters in JS
 * because Dexie cannot reliably index `undefined` vs `null` for `parentId`.
 * Non-null parent queries use the Dexie index for efficiency.
 */
export const notesRepo = {
  async get(id: string): Promise<Note | undefined> {
    return db.notes.get(id);
  },

  async put(note: Note): Promise<void> {
    assertWritable();
    await db.notes.put(note);
  },

  async bulkPut(notes: Note[]): Promise<void> {
    assertWritable();
    await db.notes.bulkPut(notes);
  },

  async remove(id: string): Promise<void> {
    assertWritable();
    await db.notes.delete(id);
  },

  async all(): Promise<Note[]> {
    return db.notes.toArray();
  },

  /**
   * Get notes by parent folder.
   * When parentId is null, returns root notes (parentId undefined or absent).
   * Uses full scan + JS filter for root case; indexed query for non-null parents.
   */
  async byParent(parentId: string | null): Promise<Note[]> {
    if (parentId === null) {
      // Root notes: parentId is undefined or absent (not stored).
      // Dexie index can't match undefined, so we filter in JS.
      const all = await db.notes.toArray();
      return all.filter((n) => n.parentId === undefined || n.parentId === null);
    }
    return db.notes.where('parentId').equals(parentId).toArray();
  },

  async byState(state: number): Promise<Note[]> {
    return db.notes.where('state').equals(state).toArray();
  },

  async byColor(colorId: string): Promise<Note[]> {
    // Note stores `color: Color` (object), not a flat `colorId`.
    // Dexie can't index nested fields, so we filter in JS.
    const all = await db.notes.toArray();
    return all.filter((n) => n.color?.id === colorId);
  },

  async search(predicate: (note: Note) => boolean): Promise<Note[]> {
    const all = await db.notes.toArray();
    return all.filter(predicate);
  },
};
