import { db } from '../db/database';
import type { Note } from '../domain/types';
import { DAY_MS, TRASH_DAYS } from './constants';
import { isDeleted, type DeletedNote, type NoteDocument } from './types';
import { sameNote } from './serialize';
import { assertWritable } from '../state/accessStore';

export function marker(note: NoteDocument, edited = note.edited): DeletedNote {
  const trashedAt = note.trashedAt ?? edited;
  return { schemaVersion: 3, id: note.id, deleted: true, edited, trashedAt, purgeAfter: note.purgeAfter ?? trashedAt + TRASH_DAYS * DAY_MS };
}
export async function localDocument(id: string): Promise<NoteDocument | undefined> {
  return (await db.syncRecords.get(id))?.tombstone ?? await db.notes.get(id);
}
export async function queueNote(note: NoteDocument): Promise<void> {
  if (isDeleted(note)) {
    await db.notes.delete(note.id);
    const record = await db.syncRecords.get(note.id);
    await db.syncRecords.put({ ...record, id: note.id, tombstone: note, accepted: undefined });
  } else {
    await db.notes.put(note);
    await db.syncRecords.update(note.id, { tombstone: undefined });
  }
  await db.outbox.where('noteId').equals(note.id).delete();
  await db.outbox.add({ noteId: note.id, op: isDeleted(note) ? 'delete' : 'upsert', queuedAt: Date.now() });
}
export async function saveNote(note: Note): Promise<void> {
  assertWritable();
  await db.transaction('rw', db.notes, db.kv, db.outbox, db.syncRecords, db.cleanup, async () => {
    assertWritable();
    await scheduleCleanup(await localDocument(note.id), note);
    await queueNote(note);
  });
}
export async function scheduleCleanup(before: NoteDocument | undefined, after: NoteDocument): Promise<void> {
  if (!before || isDeleted(before)) return;
  const retained = new Set(isDeleted(after) ? [] : after.attachments.map(a => a.id));
  for (const attachment of before.attachments) if (!retained.has(attachment.id)) {
    const id = `${after.id}:${attachment.id}`;
    await db.cleanup.put({ id, noteId: after.id, attachmentId: attachment.id });
  }
}
export async function unchanged(snapshot: NoteDocument): Promise<boolean> {
  const current = await localDocument(snapshot.id);
  return !!current && sameNote(snapshot, current);
}
