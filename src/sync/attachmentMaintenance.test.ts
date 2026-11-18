import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { attachmentsRepo } from '../db/attachmentsRepo';
import { DriveGatewayAdapter } from './driveGateway';
import { beginSession } from './session';
import { marker } from './local';
import { note } from './testing';
import { attachmentFileName, ATTACHMENT_MAINTENANCE_BATCH_SIZE } from './constants';
import type { NoteDocument, CleanupTask } from './types';
import type { DriveFile } from '../gateway/driveTypes';
import * as api from '../gateway/drive';

vi.mock('../gateway/drive', async original => ({
  ...await original<typeof import('../gateway/drive')>(),
  listChildren: vi.fn(), findFileByName: vi.fn(), fileMetadata: vi.fn(), readFile: vi.fn(),
  renameFile: vi.fn(), deleteFile: vi.fn(), backupRevisionIds: vi.fn(), backupAttachmentOwners: vi.fn(), downloadBlob: vi.fn(), uploadNamedBlob: vi.fn(),
}));
let files: DriveFile[];
let published: NoteDocument[];
const id = (i: number) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`;
function addNote(doc: NoteDocument) {
  published.push(doc); files.push({ id: doc.id, name: `tonote.note.${doc.id}.json`, version: '1' });
}
async function maintain(tasks: CleanupTask[] = []) {
  const gateway = new DriveGatewayAdapter();
  await gateway.listNotes('folder');
  return gateway.maintainAttachments('folder', published, tasks);
}
beforeEach(async () => {
  vi.resetAllMocks(); beginSession(); await db.delete(); await db.open(); files = []; published = [];
  vi.mocked(api.listChildren).mockImplementation(async () => structuredClone(files));
  vi.mocked(api.renameFile).mockImplementation(async (fileId, name) => { files.find(file => file.id === fileId)!.name = name; });
  vi.mocked(api.deleteFile).mockImplementation(async fileId => { files = files.filter(file => file.id !== fileId); });
  vi.mocked(api.backupRevisionIds).mockResolvedValue([]);
  vi.mocked(api.backupAttachmentOwners).mockResolvedValue(new Map());
});
it('renames a referenced bare UUID in place without looking up or downloading files', async () => {
  addNote(note('n', { attachments: [{ id: 'file' }] })); files.push({ id: 'binary', name: 'file' });
  await maintain();
  expect(api.renameFile).toHaveBeenCalledExactlyOnceWith('binary', attachmentFileName('n', 'file'));
  expect(files.find(file => file.id === 'binary')?.name).toBe(attachmentFileName('n', 'file'));
  expect(api.findFileByName).not.toHaveBeenCalled(); expect(api.fileMetadata).not.toHaveBeenCalled();
  expect(api.readFile).not.toHaveBeenCalled(); expect(api.downloadBlob).not.toHaveBeenCalled(); expect(api.uploadNamedBlob).not.toHaveBeenCalled();
});
it('continues bounded batches on later full passes and does no work once migrated', async () => {
  const count = ATTACHMENT_MAINTENANCE_BATCH_SIZE + 3;
  addNote(note('n', { attachments: Array.from({ length: count }, (_, i) => ({ id: id(i) })) }));
  files.push(...Array.from({ length: count }, (_, i) => ({ id: `binary-${i}`, name: id(i) })));
  await maintain(); expect(api.renameFile).toHaveBeenCalledTimes(ATTACHMENT_MAINTENANCE_BATCH_SIZE);
  await maintain(); expect(api.renameFile).toHaveBeenCalledTimes(count);
  await maintain(); expect(api.renameFile).toHaveBeenCalledTimes(count);
  expect(api.listChildren).toHaveBeenCalledTimes(3); expect(api.findFileByName).not.toHaveBeenCalled();
});
it('recovers an uncertain successful rename from the next catalogue', async () => {
  addNote(note('n', { attachments: [{ id: 'file' }] })); files.push({ id: 'binary', name: 'file' });
  vi.mocked(api.renameFile).mockImplementationOnce(async (fileId, name) => { files.find(file => file.id === fileId)!.name = name; throw new Error('timeout'); });
  await expect(maintain()).rejects.toThrow('timeout');
  await maintain(); expect(api.renameFile).toHaveBeenCalledTimes(1); expect(files).toHaveLength(2);
});
it('finds deleted-owner files on a new client with no old note or cleanup tasks', async () => {
  addNote(marker(note('n'))); files.push({ id: 'binary', name: attachmentFileName('n', 'file') });
  await maintain();
  expect(api.deleteFile).toHaveBeenCalledExactlyOnceWith('binary');
  expect(api.fileMetadata).not.toHaveBeenCalled(); expect(api.findFileByName).not.toHaveBeenCalled(); expect(api.readFile).not.toHaveBeenCalled();
});
it('collects unreferenced bare UUIDs but preserves unknown files', async () => {
  files.push({ id: 'orphan', name: id(1) }, { id: 'unknown', name: 'document.pdf' }, { id: 'unrecognized', name: 'tonote.attach.readme.txt' });
  await maintain();
  expect(api.deleteFile).toHaveBeenCalledExactlyOnceWith('orphan');
  expect(files.map(file => file.id)).toEqual(['unknown', 'unrecognized']);
});
it('protects backups and caches their references by ID/version across page loads', async () => {
  addNote(marker(note('n')));
  const backup = { id: 'backup', name: 'notes_backup.json', version: '1' };
  files.push(backup, { id: 'binary', name: attachmentFileName('n', 'file') });
  vi.mocked(api.backupAttachmentOwners).mockResolvedValue(new Map([['file', 'n']]));
  await maintain(); db.close(); await db.open(); await maintain();
  expect(api.backupAttachmentOwners).toHaveBeenCalledExactlyOnceWith('backup', []);
  expect(api.deleteFile).not.toHaveBeenCalled();
  vi.mocked(api.backupRevisionIds).mockResolvedValue(['changed']);
  vi.mocked(api.backupAttachmentOwners).mockResolvedValue(new Map());
  await maintain(); expect(api.backupAttachmentOwners).toHaveBeenCalledTimes(2);
  expect(api.deleteFile).toHaveBeenCalledExactlyOnceWith('binary');
});
it('performs no backup requests when all files have current note references', async () => {
  addNote(note('n', { attachments: [{ id: 'file' }] }));
  files.push({ id: 'backup', name: 'notes_backup.json', version: '1' }, { id: 'binary', name: attachmentFileName('n', 'file') });
  await maintain(); expect(api.backupAttachmentOwners).not.toHaveBeenCalled(); expect(api.deleteFile).not.toHaveBeenCalled();
});
it('does not collect a file referenced by another note or pending local bytes', async () => {
  addNote(marker(note('n'))); addNote(note('other', { attachments: [{ id: 'shared' }] }));
  files.push({ id: 'shared', name: attachmentFileName('n', 'shared') }, { id: 'pending', name: id(1) });
  await attachmentsRepo.put(id(1), new Blob(['new bytes']));
  await maintain(); expect(api.deleteFile).not.toHaveBeenCalled();
});
it('checks local references again after backup requests finish', async () => {
  addNote(marker(note('n')));
  files.push({ id: 'backup', name: 'notes_backup.json', version: '1' }, { id: 'binary', name: attachmentFileName('n', 'file') });
  vi.mocked(api.backupAttachmentOwners).mockImplementation(async () => {
    await db.notes.put(note('restored', { attachments: [{ id: 'file' }] })); return new Map();
  });
  await maintain(); expect(api.deleteFile).not.toHaveBeenCalled();
});
it('stops before any mutations when multiple physical files claim the same attachment', async () => {
  addNote(note('n', { attachments: [{ id: 'file' }] }));
  files.push({ id: 'old', name: 'file' }, { id: 'new', name: attachmentFileName('n', 'file') });
  await expect(maintain()).rejects.toThrow('Ambiguous');
  expect(api.deleteFile).not.toHaveBeenCalled(); expect(api.renameFile).not.toHaveBeenCalled();
});
it('requires a complete catalogue and all published documents before maintenance', async () => {
  addNote(note('n')); files.push({ id: 'orphan', name: id(1) });
  const gateway = new DriveGatewayAdapter();
  await expect(gateway.maintainAttachments('folder', published, [])).rejects.toThrow('catalogue');
  await gateway.listNotes('folder');
  await expect(gateway.maintainAttachments('folder', [], [])).rejects.toThrow('snapshot');
  expect(api.deleteFile).not.toHaveBeenCalled();
});
it('treats repeated DELETE 404 and already absent candidates as successfully collected', async () => {
  addNote(marker(note('n'))); files.push({ id: 'binary', name: attachmentFileName('n', 'file') });
  vi.mocked(api.deleteFile).mockRejectedValue(new api.DriveError(404, 'Not found', 'url'));
  const tasks = [{ id: 'n:file', noteId: 'n', attachmentId: 'file' }, { id: 'n:gone', noteId: 'n', attachmentId: 'gone' }];
  expect(await maintain(tasks)).toEqual(['file', 'gone']);
});
it('keeps all files when backup reference inspection fails', async () => {
  addNote(marker(note('n')));
  files.push({ id: 'backup', name: 'notes_backup.json', version: '1' }, { id: 'binary', name: attachmentFileName('n', 'file') });
  vi.mocked(api.backupAttachmentOwners).mockRejectedValue(new Error('permission denied'));
  await expect(maintain()).rejects.toThrow('permission denied');
  expect(api.deleteFile).not.toHaveBeenCalled();
});
it('shares the mutation budget between collection and renaming', async () => {
  addNote(marker(note('deleted'))); addNote(note('live', { attachments: [{ id: 'kept' }] }));
  files.push(...Array.from({ length: ATTACHMENT_MAINTENANCE_BATCH_SIZE + 2 }, (_, i) => ({ id: `unused-${i}`, name: attachmentFileName('deleted', id(i)) })));
  files.push({ id: 'live-binary', name: 'kept' });
  await maintain();
  expect(api.deleteFile).toHaveBeenCalledTimes(ATTACHMENT_MAINTENANCE_BATCH_SIZE);
  expect(api.renameFile).not.toHaveBeenCalled();
  await maintain();
  expect(api.deleteFile).toHaveBeenCalledTimes(ATTACHMENT_MAINTENANCE_BATCH_SIZE + 2);
  expect(api.renameFile).toHaveBeenCalledExactlyOnceWith('live-binary', attachmentFileName('live', 'kept'));
});
it('renames a backup-only legacy file using the owner recorded in the backup', async () => {
  files.push({ id: 'backup', name: 'notes_backup.json', version: '1' }, { id: 'binary', name: id(1) });
  vi.mocked(api.backupAttachmentOwners).mockResolvedValue(new Map([[id(1), 'n']]));
  await maintain();
  expect(api.renameFile).toHaveBeenCalledExactlyOnceWith('binary', attachmentFileName('n', id(1))); expect(api.deleteFile).not.toHaveBeenCalled();
});
it('collects orphaned owned files even without a tombstone or cleanup task', async () => {
  addNote(note('live'));
  files.push({ id: 'pending-edit', name: attachmentFileName('live', 'file') }, { id: 'pending-new-note', name: attachmentFileName(id(1), id(2)) });
  await maintain();
  expect(api.deleteFile).toHaveBeenCalledTimes(2); expect(files).toHaveLength(1);
});
it('collects an attachment removed from a live note only with an explicit cleanup task', async () => {
  addNote(note('live')); files.push({ id: 'binary', name: attachmentFileName('live', 'file') });
  expect(await maintain([{ id: 'live:file', noteId: 'live', attachmentId: 'file' }])).toEqual(['file']);
  expect(api.deleteFile).toHaveBeenCalledExactlyOnceWith('binary');
});
