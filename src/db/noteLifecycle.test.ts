import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './database';
import { changeNoteState } from './noteLifecycle';
import { createNoteDraft } from '../domain/noteDraft';
beforeEach(async () => { await db.delete(); await db.open(); });
it('restores a trashed child to root if its parent is still in trash', async () => {
  const parent = { ...createNoteDraft('folder'), state: 2 as const };
  const child = { ...createNoteDraft('plain'), state: 3 as const, parentId: parent.id };
  await db.notes.bulkPut([parent, child]);
  await changeNoteState(child.id, 'restore');
  expect(await db.notes.get(child.id)).toMatchObject({ state: 0 });
  expect((await db.notes.get(child.id))?.parentId).toBeUndefined();
  expect((await db.notes.get(parent.id))?.state).toBe(2);
});
it('permanently removes a folder and descendants and queues remote deletion atomically', async () => {
  const parent = { ...createNoteDraft('folder'), state: 2 as const };
  const child = { ...createNoteDraft('plain'), state: 3 as const, parentId: parent.id };
  await db.notes.bulkPut([parent, child]);
  await db.outbox.add({ noteId: child.id, op: 'upsert', queuedAt: 0 });
  await changeNoteState(parent.id, 'purge');
  expect(await db.notes.count()).toBe(0);
  const entries = await db.outbox.toArray();
  expect(entries).toHaveLength(2);
  expect(entries.every(entry => entry.op === 'delete')).toBe(true);
});
it('does not allow permanent deletion of active or archived notes', async () => {
  const note = { ...createNoteDraft('plain'), state: 1 as const };
  await db.notes.put(note);
  await expect(changeNoteState(note.id, 'purge')).rejects.toThrow();
  expect(await db.notes.get(note.id)).toEqual(note);
  expect(await db.outbox.count()).toBe(0);
});
