import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { changeNoteState } from '../db/noteLifecycle';
import { fullSync, sendPending } from './engine';
import { localDocument, marker, saveNote } from './local';
import { FakeDrive, note } from './testing';
import { beginSession } from './session';

let drive: FakeDrive;
beforeEach(async () => { beginSession(); await db.delete(); await db.open(); drive = new FakeDrive(); });

it('publishes one final marker immediately and cleans files without another note write', async () => {
  const source = note('n', { state: 2, edited: Date.now(), attachments: [{ id: 'file' }] });
  drive.seed(source); drive.attachmentIds.add('file'); await fullSync(drive);
  await changeNoteState('n', 'purge');
  const deleted = await localDocument('n');
  expect(Object.keys(deleted!).sort()).toEqual(['deleted', 'edited', 'id', 'schemaVersion']);
  const maintain = vi.spyOn(drive, 'maintainAttachments');
  await sendPending(drive);
  expect(drive.documents.get('n')?.value).toEqual(deleted);
  expect(maintain).not.toHaveBeenCalled(); expect(drive.attachmentIds.has('file')).toBe(true);
  const writes = drive.writes;
  await fullSync(drive);
  expect(drive.cleaned).toEqual(['file']); expect(drive.writes).toBe(writes);
  expect(drive.documents.get('n')?.value).toEqual(deleted);
});
it('collects files of an already deleted note without previous local content or journal', async () => {
  drive.seed(marker(note('n'))); drive.attachmentIds.add('file');
  await fullSync(drive);
  expect(drive.cleaned).toEqual(['file']); expect(drive.writes).toBe(0);
});
it('retains a final marker while backup references postpone collection', async () => {
  drive.seed(marker(note('n'))); drive.attachmentIds.add('file'); drive.protectedIds.add('file');
  await fullSync(drive); await fullSync(drive);
  expect(drive.cleaned).toEqual([]); expect(drive.writes).toBe(0);
  drive.protectedIds.clear(); await fullSync(drive);
  expect(drive.cleaned).toEqual(['file']); expect(drive.writes).toBe(0);
});
it('retries failed collection from the catalogue after losing the local database', async () => {
  drive.seed(marker(note('n'))); drive.attachmentIds.add('file');
  vi.spyOn(drive, 'maintainAttachments').mockRejectedValueOnce(new Error('network'));
  expect(await fullSync(drive)).toMatchObject({ kind: 'ok', maintenanceDeferred: true });
  expect(drive.documents.get('n')?.value).toEqual(marker(note('n')));
  await db.delete(); await db.open(); await fullSync(drive);
  expect(drive.cleaned).toEqual(['file']); expect(drive.writes).toBe(0);
});
it('keeps a local restoration made while maintenance is in flight', async () => {
  drive.seed(marker(note('n'))); drive.attachmentIds.add('file');
  const maintain = drive.maintainAttachments.bind(drive);
  vi.spyOn(drive, 'maintainAttachments').mockImplementation(async (...args) => {
    await saveNote(note('n', { edited: 300, attachments: [{ id: 'file' }] }));
    return maintain(...args);
  });
  await fullSync(drive);
  expect(drive.cleaned).toEqual([]);
  expect((await db.notes.get('n'))?.edited).toBe(300); expect(await db.outbox.count()).toBe(1);
  await sendPending(drive);
  expect(drive.documents.get('n')?.value).toMatchObject({ edited: 300 });
});
it('keeps a published marker when another note prevents deleting a shared UUID', async () => {
  drive.seed(marker(note('n'))); drive.seed(note('other', { attachments: [{ id: 'shared' }] }));
  drive.attachmentIds.add('shared'); await fullSync(drive);
  expect(drive.cleaned).toEqual([]); expect(drive.writes).toBe(0);
});
it('does not migrate or collect after a failed or deferred full refresh', async () => {
  await saveNote(note('n')); drive.seed(note('n', { edited: 200 }));
  drive.afterRead = async () => { drive.afterRead = undefined; await saveNote(note('n', { edited: 300 })); };
  const maintain = vi.spyOn(drive, 'maintainAttachments');
  expect((await fullSync(drive)).deferred).toBe(1);
  expect(maintain).not.toHaveBeenCalled();
});

const day = 86400000;
it.each([true, false])('merges offline restoration and automatic expiry in both directions (local restore %s)', async localRestore => {
  const restored = note('n', { edited: 10 * day });
  const expired = marker(note('n'), 16 * day, true);
  if (localRestore) {
    await saveNote(restored);
    drive.seed(expired);
  } else {
    drive.seed(expired);
    await fullSync(drive);
    drive.seed(restored);
  }
  await fullSync(drive);
  expect(await db.notes.get('n')).toMatchObject({ edited: 10 * day, state: 0 });
  expect(drive.documents.get('n')?.value).toMatchObject({ edited: 10 * day, state: 0 });
});

it('compares expired trash before targeted push and persists its automatic marker', async () => {
  await saveNote(note('n', { state: 2, edited: day }));
  drive.seed(note('n', { edited: day }));
  await sendPending(drive);
  const expected = { schemaVersion: 3, id: 'n', deleted: true, edited: 16 * day, autoExpired: true };
  expect(drive.documents.get('n')?.value).toEqual(expected);
  db.close(); await db.open();
  expect(await localDocument('n')).toEqual(expected);
});

it('honors manual deletion after offline restoration', async () => {
  await saveNote(note('n', { edited: 10 * day }));
  drive.seed(marker(note('n'), 16 * day));
  await sendPending(drive);
  await fullSync(drive);
  expect(await localDocument('n')).toEqual(marker(note('n'), 16 * day));
});
