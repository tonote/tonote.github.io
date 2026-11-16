import { DEFAULT_CATEGORY, DEFAULT_CATEGORY_ID } from '../domain/color';
import { db } from './database.js';
import type { Color } from '../domain/types.js';
import { assertWritable } from '../state/accessStore';

export const colorsRepo = {
  async forNewNote(categoryId?: string): Promise<Color> {
    assertWritable();
    return db.transaction('rw', db.colors, async () => {
      assertWritable();
      if (categoryId) {
        const selected = await db.colors.get(categoryId);
        if (selected) return selected;
      }
      const stored = await db.colors.get(DEFAULT_CATEGORY_ID);
      if (stored) return stored;
      const fallback = { ...DEFAULT_CATEGORY, edited: Date.now() };
      await db.colors.put(fallback);
      return fallback;
    });
  },

  async get(id: string): Promise<Color | undefined> {
    return db.colors.get(id);
  },

  async put(color: Color): Promise<void> {
    assertWritable();
    await db.transaction('rw', db.colors, db.outbox, async () => {
      assertWritable();
      await db.colors.put(color);
      await db.outbox.add({ noteId: '@config', op: 'upsert', queuedAt: Date.now() });
    });
    window.dispatchEvent(new Event('tonote-local-change'));
  },

  async bulkPut(colors: Color[]): Promise<void> {
    assertWritable();
    await db.colors.bulkPut(colors);
  },

  async all(): Promise<Color[]> {
    return db.colors.toArray();
  },

  async remove(id: string): Promise<boolean> {
    assertWritable();
    if (id === DEFAULT_CATEGORY_ID) return false;
    const removed = await db.transaction('rw', db.colors, db.notes, db.kv, db.outbox, async () => {
      assertWritable();
      // Include archived and trashed notes: they can still be restored.
      const used = await db.notes.filter((note) => note.color.id === id).count();
      if (used > 0) return false;
      const previous = (await db.kv.get('deleted-colors'))?.value as { id: string; edited: number; deleted: true }[] ?? [];
      await db.kv.put({ key: 'deleted-colors', value: [...previous.filter(c => c.id !== id), { id, edited: Date.now(), deleted: true }] });
      await db.colors.delete(id);
      await db.outbox.add({ noteId: '@config', op: 'upsert', queuedAt: Date.now() });
      return true;
    });
    if (removed) window.dispatchEvent(new Event('tonote-local-change'));
    return removed;
  },
};
