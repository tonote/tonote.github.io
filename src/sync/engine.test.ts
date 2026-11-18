import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { fullSync, sendPending } from './engine';
import { saveNote, marker } from './local';
import { FakeDrive, note } from './testing';
import { beginSession, endSession } from './session';
import { changeNoteState } from '../db/noteLifecycle';
import { DEFAULT_CATEGORY, DEFAULT_CATEGORY_ID } from '../domain/color';
import { isDeleted } from './types';

let drive: FakeDrive;
beforeEach(async () => { beginSession(); await db.delete(); await db.open(); drive = new FakeDrive(); });

it('does not send queued stale edits over a newer remote note; applies it only during active refresh', async () => {
  await saveNote(note('n', { edited: 100 })); drive.seed(note('n', { edited: 200, content: 'remote' }));
  await sendPending(drive);
  expect(drive.lists).toBe(0); expect(drive.writes).toBe(0);
  expect((await db.notes.get('n'))?.content).toBe('text'); expect(await db.outbox.count()).toBe(1);
  await fullSync(drive);
  expect((await db.notes.get('n'))?.content).toBe('remote'); expect(await db.outbox.count()).toBe(0);
});
it('sends only the requested note and uploads a local winner', async () => {
  await saveNote(note('a', { edited: 200 })); await saveNote(note('b'));
  drive.seed(note('a', { edited: 100 }));
  await sendPending(drive, 'a');
  expect(drive.documents.get('a')!.value.edited).toBe(200); expect(drive.documents.has('b')).toBe(false); expect(drive.lists).toBe(0);
  expect(await db.outbox.count()).toBe(1);
});
it('keeps local on equal time and full document type, but deletion wins a tie', async () => {
  await saveNote(note('a', { content: 'local' })); drive.seed(note('a', { content: 'remote' }));
  await saveNote(note('b')); drive.seed(marker(note('b')));
  await fullSync(drive);
  expect(drive.documents.get('a')!.value).toMatchObject({ content: 'local', edited: 100 });
  expect(await db.notes.get('b')).toBeUndefined(); expect((await db.syncRecords.get('b'))?.tombstone).toBeDefined();
});
it('does not download or rewrite unchanged note files on the next refresh', async () => {
  drive.seed(note('n')); await fullSync(drive); const reads = drive.reads, writes = drive.writes;
  await fullSync(drive); expect(drive.reads).toBe(reads); expect(drive.writes).toBe(writes);
});
it('checks 176 cached notes without per-note database reads/writes or progress ticks', async () => {
  for (let i = 0; i < 176; i++) drive.seed(note(`cached-${i}`));
  await fullSync(drive);
  const reads = drive.reads, writes = drive.writes;
  const getNote = vi.spyOn(db.notes, 'get'), getRecord = vi.spyOn(db.syncRecords, 'get');
  const putRecord = vi.spyOn(db.syncRecords, 'put');
  const progress: import('../state/syncStore').SyncProgress[] = [];
  try {
    await fullSync(drive, value => progress.push(value));
    expect(drive.reads).toBe(reads); expect(drive.writes).toBe(writes);
    expect(getNote).not.toHaveBeenCalled(); expect(getRecord).not.toHaveBeenCalled();
    expect(putRecord).not.toHaveBeenCalled();
    expect(progress.filter(p => p.phase === 'loading' || p.phase === 'notes')).toEqual([]);
  } finally { getNote.mockRestore(); getRecord.mockRestore(); putRecord.mockRestore(); }
});
it('loads only a changed remote version and retains queued edits among cached notes', async () => {
  drive.seed(note('changed')); drive.seed(note('local')); drive.seed(note('unchanged'));
  await fullSync(drive);
  const reads = drive.reads, writes = drive.writes;
  drive.seed(note('changed', { edited: 200, content: 'new remote' }));
  await saveNote(note('local', { edited: 300, content: 'new local' }));
  const progress: import('../state/syncStore').SyncProgress[] = [];
  await fullSync(drive, value => progress.push(value));
  expect(drive.reads - reads).toBe(1); expect(drive.writes - writes).toBe(1);
  expect((await db.notes.get('changed'))?.content).toBe('new remote');
  expect(drive.documents.get('local')?.value).toMatchObject({ content: 'new local' });
  expect(await db.outbox.count()).toBe(0);
  expect(progress.filter(p => p.phase === 'loading').at(-1)).toMatchObject({ completed: 1, total: 1 });
  expect(progress.filter(p => p.phase === 'notes').at(-1)).toMatchObject({ completed: 2, total: 2 });
});
it('acknowledges an unchanged queued note instead of skipping its durable queue', async () => {
  drive.seed(note('n')); await fullSync(drive);
  await saveNote(note('n'));
  const writes = drive.writes;
  await fullSync(drive);
  expect(await db.outbox.count()).toBe(0); expect(drive.writes).toBe(writes);
});
it('retains a concurrent save of a cached note while another remote file downloads', async () => {
  drive.seed(note('cached')); drive.seed(note('changed')); await fullSync(drive);
  drive.seed(note('changed', { edited: 200 }));
  drive.afterRead = async () => {
    drive.afterRead = undefined;
    await saveNote(note('cached', { edited: 300, content: 'saved during download' }));
  };
  await fullSync(drive);
  expect((await db.notes.get('cached'))?.content).toBe('saved during download');
  expect(await db.outbox.count()).toBe(1);
  await sendPending(drive);
  expect(drive.documents.get('cached')?.value).toMatchObject({ edited: 300, content: 'saved during download' });
});
it('treats a previously known file disappearing as an error and retains the local note', async () => {
  drive.seed(note('n')); await fullSync(drive); drive.documents.delete('n');
  await expect(fullSync(drive)).rejects.toThrow('missing'); expect(await db.notes.get('n')).toBeDefined(); expect(drive.writes).toBe(0);
});
it('does not bootstrap synchronization or upload pending local notes when only a backup exists', async () => {
  drive.config = null;
  await saveNote(note('local')); await saveNote(note('shared', { edited: 300 }));
  drive.legacy = { version: '1', id: 'backup', updated: 1, colors: [DEFAULT_CATEGORY], notes: [note('shared', { edited: 100 }), note('backup-only')] };
  expect((await fullSync(drive)).kind).toBe('readonly');
  expect(drive.documents.size).toBe(0); expect(drive.config).toBeNull();
  expect((await db.notes.get('shared'))?.edited).toBe(300); expect(await db.outbox.count()).toBe(2);
  expect(await db.backupNotes.count()).toBe(2);
});
it('retains a newer local save and its durable queue when an older snapshot finishes uploading', async () => {
  await saveNote(note('n'));
  drive.afterWrite = async () => { drive.afterWrite = undefined; await saveNote(note('n', { edited: 200, content: 'new' })); };
  await sendPending(drive); expect(await db.outbox.count()).toBeGreaterThan(0);
  await sendPending(drive); expect(drive.documents.get('n')!.value).toMatchObject({ edited: 200, content: 'new' }); expect(await db.outbox.count()).toBe(0);
});
it('does not overwrite a local edit made during a download', async () => {
  await saveNote(note('n')); drive.seed(note('n', { edited: 200 }));
  drive.afterRead = async () => { drive.afterRead = undefined; await saveNote(note('n', { edited: 300 })); };
  const result = await fullSync(drive); expect(result.deferred).toBe(1); expect((await db.notes.get('n'))!.edited).toBe(300);
  await fullSync(drive); expect(drive.documents.get('n')!.value.edited).toBe(300);
});
it('retries an uncertain successful write without creating a duplicate or losing its queue', async () => {
  await saveNote(note('n')); drive.afterWrite = async () => { drive.afterWrite = undefined; throw new Error('timeout'); };
  await expect(sendPending(drive)).rejects.toThrow('timeout'); expect(await db.outbox.count()).toBe(1);
  await sendPending(drive); expect(drive.documents.size).toBe(1); expect(drive.writes).toBe(1); expect(await db.outbox.count()).toBe(0);
});
it('records the deadline when expiring trash and allows a newer restoration to replace the marker', async () => {
  drive.seed(note('n', { state: 2, edited: 100 }));
  await fullSync(drive); expect(drive.documents.get('n')!.value).toMatchObject({ deleted: true, autoExpired: true, edited: 100 + 15 * 86400000 });
  await saveNote(note('n', { edited: 300 })); await fullSync(drive);
  expect(isDeleted(drive.documents.get('n')!.value)).toBe(false); expect((await db.notes.get('n'))!.state).toBe(0);
});
it('cascades folder markers even over newer children and removes truly orphaned notes', async () => {
  drive.seed(marker(note('folder'))); drive.seed(note('child', { parentId: 'folder', edited: 500 })); drive.seed(note('orphan', { parentId: 'absent' }));
  await fullSync(drive);
  expect(isDeleted(drive.documents.get('child')!.value)).toBe(true); expect(isDeleted(drive.documents.get('orphan')!.value)).toBe(true);
});
it('hides children of trashed folders and preserves never-uploaded local parents', async () => {
  const future = Date.now() + 100000;
  drive.seed(note('folder', { state: 2, edited: future, checkings: 'f' }));
  drive.seed(note('child', { parentId: 'folder' }));
  await saveNote(note('new-parent', { checkings: 'f' })); await saveNote(note('new-child', { parentId: 'new-parent' }));
  await fullSync(drive);
  expect((await db.notes.get('child'))!.state).toBe(3); expect((await db.notes.get('new-child'))!.state).toBe(0);
});
it('uses default for missing/deleted categories and merges remote categories', async () => {
  const color = { ...DEFAULT_CATEGORY, id: 'work', edited: 200, theme: 'Work' };
  drive.config!.value.colors.push(color, { id: 'gone', edited: 100, deleted: true });
  drive.seed(note('missing', { color: { ...DEFAULT_CATEGORY, id: 'gone' } })); drive.seed(note('work', { color }));
  await fullSync(drive);
  expect((await db.notes.get('missing'))!.color.id).toBe(DEFAULT_CATEGORY_ID); expect((await db.colors.get('work'))!.theme).toBe('Work');
});
it('publishes a restored document using attachment metadata even when its old file is absent', async () => {
  await saveNote(note('n', { attachments: [{ id: 'file', noteId: 'n' }] })); drive.seed(marker(note('n', { edited: 50 })));
  await sendPending(drive);
  expect(drive.documents.get('n')!.value).toMatchObject({ attachments: [{ id: 'file' }] });
  expect(await db.outbox.count()).toBe(0); expect(drive.attachmentUploads).toBe(0);
});
it('cleans removed attachments after publication and keeps backup-protected cleanup tasks', async () => {
  drive.attachmentIds.add('file'); drive.seed(note('n', { attachments: [{ id: 'file' }] })); await fullSync(drive);
  await saveNote(note('n', { edited: 200 })); drive.protectedIds.add('file'); await fullSync(drive);
  expect(await db.cleanup.count()).toBe(1); expect(drive.cleaned).toEqual([]);
  drive.protectedIds.clear(); await fullSync(drive); expect(drive.cleaned).toEqual(['file']); expect(await db.cleanup.count()).toBe(0);
});
it('persists an encrypted deletion marker before removing local contents', async () => {
  await saveNote(note('secret', { iv: 'AA==', encryptionSalt: 'AQ==' }));
  await changeNoteState('secret', 'trash');
  expect(await db.notes.get('secret')).toBeUndefined();
  expect((await db.syncRecords.get('secret'))!.tombstone).not.toHaveProperty('content'); expect(await db.outbox.count()).toBeGreaterThan(0);
});
it('blocks stale ciphertext while allowing unrelated plaintext sends', async () => {
  drive.config!.value.salt = 'Ag=='; drive.config!.value.checker = 'AQ==';
  await saveNote(note('secret', { iv: 'AA==', encryptionSalt: 'AQ==' })); await saveNote(note('plain'));
  await expect(sendPending(drive)).rejects.toThrow('password');
  expect(drive.documents.has('secret')).toBe(false); expect(drive.documents.has('plain')).toBe(true); expect(await db.outbox.count()).toBe(1);
});
it('copies compatible ciphertext without unlocking', async () => {
  drive.config!.value.salt = 'Ag=='; drive.config!.value.checker = 'AQ=='; drive.seed(note('secret', { iv: 'AA==', encryptionSalt: 'Ag==' }));
  await fullSync(drive); expect((await db.notes.get('secret'))!.iv).toBe('AA==');
});
it('does not apply a late response from a signed-out session', async () => {
  drive.seed(note('n')); drive.afterRead = async () => { endSession(); };
  await expect(fullSync(drive)).rejects.toThrow('session'); expect(await db.notes.get('n')).toBeUndefined();
});

it('restores parent_removed children before expiring stale inherited retention times', async () => {
  drive.seed(note('child', { parentId: 'folder', state: 3, edited: 10 }));
  drive.seed(note('folder', { checkings: 'f', state: 0, edited: 200 }));
  await fullSync(drive);
  expect((await db.notes.get('child'))?.state).toBe(0);
  expect(isDeleted(drive.documents.get('child')!.value)).toBe(false);
});
it('waits for Android to finish an interrupted migration and only displays the backup', async () => {
  drive.config!.value.initialized = false;
  drive.legacy = { version: '1', id: 'old', updated: 1, colors: [DEFAULT_CATEGORY], notes: [note('not-yet-published')] };
  await fullSync(drive);
  expect(drive.documents.has('not-yet-published')).toBe(false); expect(drive.config!.value.initialized).toBe(false);
  expect(await db.backupNotes.get('not-yet-published')).toBeDefined();
});

it('synchronization continues past a failed new-file upload and retries only the failed note', async () => {
  drive.pendingUploadIds.add('missing-file'); drive.failedAttachmentIds.add('missing-file');
  await saveNote(note('broken', { attachments: [{ id: 'missing-file' }] }));
  for (let i = 0; i < 175; i++) await saveNote(note(`healthy-${i}`));
  const progress: import('../state/syncStore').SyncProgress[] = [];
  await expect(fullSync(drive, value => progress.push(value))).rejects.toThrow('upload failed');
  expect(drive.documents.size).toBe(175);
  expect(await db.outbox.count()).toBe(1);
  expect(drive.config!.value.initialized).toBe(true);
  expect(progress.filter(p => p.phase === 'notes').at(-1)).toMatchObject({ completed: 176, total: 176 });
  drive.failedAttachmentIds.clear();
  await sendPending(drive, 'broken');
  expect(drive.documents.get('broken')!.value).toMatchObject({ attachments: [{ id: 'missing-file' }] });
  expect(drive.attachmentUploads).toBe(1);
  expect(await db.outbox.count()).toBe(0);
  const writes = drive.writes;
  await fullSync(drive);
  expect(drive.config!.value.initialized).toBe(true);
  expect(drive.writes).toBe(writes);
});

it('accepts incoming attachment metadata without checking or downloading the referenced files', async () => {
  drive.seed(note('broken', { attachments: [{ id: 'missing-file' }] })); drive.seed(note('healthy'));
  const upload = vi.spyOn(drive, 'uploadPendingAttachments');
  await fullSync(drive);
  expect(await db.notes.get('broken')).toMatchObject({ attachments: [{ id: 'missing-file' }] });
  expect(await db.notes.get('healthy')).toBeDefined();
  expect(upload).not.toHaveBeenCalled();
});
it('displays a backup without requiring old attachment bytes or publishing any files', async () => {
  drive.config = null;
  drive.legacy = { version: '1', id: 'backup', updated: 1, colors: [DEFAULT_CATEGORY], notes:
    Array.from({ length: 176 }, (_, i) => note(`n-${i}`, { attachments: [{ id: `missing-${i}` }] })),
  };
  await fullSync(drive);
  expect(drive.documents.size).toBe(0); expect(await db.backupNotes.count()).toBe(176);
  expect(await db.outbox.count()).toBe(0); expect(drive.config).toBeNull();
  expect(drive.attachmentUploads).toBe(0);
});
it('does not reupload confirmed new-file bytes after an uncertain JSON write', async () => {
  await saveNote(note('n', { attachments: [{ id: 'new-file' }] })); drive.pendingUploadIds.add('new-file');
  drive.afterWrite = async () => { drive.afterWrite = undefined; throw new Error('timeout'); };
  await expect(sendPending(drive)).rejects.toThrow('timeout');
  expect(drive.attachmentUploads).toBe(1); expect(await db.outbox.count()).toBe(1);
  await sendPending(drive);
  expect(drive.attachmentUploads).toBe(1); expect(await db.outbox.count()).toBe(0);
});
it('finishes a pending new-file upload even when the JSON already matches Drive', async () => {
  const source = note('n', { attachments: [{ id: 'new-file' }] });
  drive.seed(source); await saveNote(source); drive.pendingUploadIds.add('new-file');
  await sendPending(drive);
  expect(drive.attachmentUploads).toBe(1); expect(drive.writes).toBe(0);
  expect(await db.outbox.count()).toBe(0);
});
