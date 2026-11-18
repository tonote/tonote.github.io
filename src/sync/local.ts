import { db } from '../db/database';
import type { Note } from '../domain/types';
import { DAY_MS, TRASH_DAYS } from './constants';
import { isDeleted, type DeletedNote, type NoteDocument } from './types';
import { sameNote } from './serialize';
import { assertWritable } from '../state/accessStore';

export function marker(note: NoteDocument, edited = note.edited, autoExpired = false): DeletedNote {
  return { schemaVersion: 3, id: note.id, deleted: true, edited, ...(autoExpired ? { autoExpired: true as const } : {}) };
}
export function expireTrash(doc: NoteDocument, now: number): NoteDocument {
  if (isDeleted(doc) || doc.state < 2) return doc;
  if (doc.iv) return marker(doc);
  const deadline = doc.edited + TRASH_DAYS * DAY_MS;
  return deadline <= now ? marker(doc, deadline, true) : doc;
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
    const current = await localDocument(note.id);
    if (current && !isDeleted(current) && current.state >= 2) throw new Error('Restore the note before editing it');
    await discardRemovedBytes(current, note);
    await scheduleCleanup(current, note);
    await queueNote(note);
  });
}
export async function discardRemovedBytes(before: NoteDocument | undefined, after: NoteDocument) {
  if (!before || isDeleted(before)) return;
  const retained = new Set(isDeleted(after) ? [] : after.attachments.map(item => item.id));
  for (const item of before.attachments) if (!retained.has(item.id)) await db.kv.delete(`attachment:${item.id}`);
}
export async function scheduleCleanup(before: NoteDocument | undefined, after: NoteDocument): Promise<void> {
  const retained = new Set(isDeleted(after) ? [] : after.attachments.map(a => a.id));
  const candidates = new Set(before && !isDeleted(before) ? before.attachments.map(a => a.id) : []);
  for (const attachmentId of candidates) if (!retained.has(attachmentId)) {
    const id = `${after.id}:${attachmentId}`;
    await db.cleanup.put({ id, noteId: after.id, attachmentId });
  }
}
export async function unchanged(snapshot: NoteDocument): Promise<boolean> {
  const current = await localDocument(snapshot.id);
  return !!current && sameNote(snapshot, current);
}
