import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { beginSession } from './session';
import { FakeDrive, note } from './testing';
import { DriveGatewayAdapter } from './driveGateway';
import * as api from '../gateway/drive';
import { serializeNote } from './serialize';
import { attachmentsRepo } from '../db/attachmentsRepo';
import { fullSync } from './engine';
import { DEFAULT_CATEGORY } from '../domain/color';
vi.mock('../gateway/drive', async original => {
  const actual = await original<typeof import('../gateway/drive')>();
  return { ...actual, findFolder: vi.fn(), findFileByName: vi.fn(), generateFileId: vi.fn(), createFolder: vi.fn(), writeDocument: vi.fn(), readFile: vi.fn(), downloadText: vi.fn(), fileMetadata: vi.fn(), listChildren: vi.fn(), downloadBlob: vi.fn(), uploadNamedBlob: vi.fn(), renameFile: vi.fn(), backupAttachmentIds: vi.fn(), deleteFile: vi.fn() };
});
let gateway: DriveGatewayAdapter;
beforeEach(async () => {
  vi.resetAllMocks(); beginSession(); await db.delete(); await db.open(); gateway = new DriveGatewayAdapter();
  vi.mocked(api.findFolder).mockResolvedValue({ id: 'folder', name: 'Notes Backup (com.gcteam.tonote)' });
  vi.mocked(api.findFileByName).mockResolvedValue(null);
  vi.mocked(api.generateFileId).mockResolvedValue('allocated-id');
});
it('persists the allocated creation ID before upload and reuses it after a timeout', async () => {
  vi.mocked(api.writeDocument).mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ id: 'allocated-id', name: 'tonote.note.n.json', version: '1' });
  await expect(gateway.writeNote('folder', note('n'))).rejects.toThrow('timeout');
  gateway = new DriveGatewayAdapter(); await gateway.writeNote('folder', note('n'));
  expect(api.generateFileId).toHaveBeenCalledOnce();
  expect(vi.mocked(api.writeDocument).mock.calls.map(call => call[3])).toEqual(['allocated-id', 'allocated-id']);
});
it('keeps the media ETag with the read snapshot for a conditional update', async () => {
  vi.mocked(api.findFileByName).mockResolvedValue({ id: 'n', name: 'tonote.note.n.json', version: '2' });
  vi.mocked(api.readFile).mockResolvedValue({ text: serializeNote(note('n')), etag: '"snapshot"' });
  const remote = await gateway.readNote('folder', 'n');
  vi.mocked(api.writeDocument).mockResolvedValue({ id: 'n', name: 'tonote.note.n.json', version: '3' });
  await gateway.writeNote('folder', note('n', { edited: 200 }), remote!.file);
  expect(vi.mocked(api.writeDocument).mock.calls[0][4]).toMatchObject({ etag: '"snapshot"' });
});
it('rejects a stale server version during fallback preflight and refuses duplicate note names', async () => {
  vi.mocked(api.fileMetadata).mockResolvedValue({ id: 'n', name: 'tonote.note.n.json', version: '3' });
  await expect(gateway.writeNote('folder', note('n'), { id: 'n', name: 'tonote.note.n.json', version: '2' })).rejects.toThrow('changed');
  expect(api.writeDocument).not.toHaveBeenCalled();
  vi.mocked(api.listChildren).mockResolvedValue([{ id: '1', name: 'tonote.note.n.json' }, { id: '2', name: 'tonote.note.n.json' }]);
  await expect(gateway.listNotes('folder')).rejects.toThrow('Duplicate');
});
it('uploads only new pending bytes and removes the local copy after Drive confirms', async () => {
  await attachmentsRepo.put('file', new Blob(['bytes']));
  vi.mocked(api.fileMetadata).mockRejectedValue(new api.DriveError(404, 'Not found', 'url'));
  vi.mocked(api.uploadNamedBlob).mockResolvedValue({ id: 'allocated-id', name: 'tonote.attach.n.file' });
  await gateway.uploadPendingAttachments('folder', note('n', { attachments: [{ id: 'old-missing' }, { id: 'file' }] }));
  expect(api.uploadNamedBlob).toHaveBeenCalledWith('allocated-id', 'tonote.attach.n.file', expect.anything(), 'folder');
  expect(await attachmentsRepo.get('file')).toBeUndefined();
  expect(vi.mocked(api.findFileByName).mock.calls.every(([name]) => !name.includes('old-missing'))).toBe(true);
});
it('preserves backup references during cleanup', async () => {
  vi.mocked(api.findFileByName).mockImplementation(async name => name === 'tonote.attach.n.file' ? { id: 'binary', name } : name === 'tonote.note.n.json' ? { id: 'n', name } : null);
  vi.mocked(api.readFile).mockResolvedValue({ text: serializeNote(note('n')) });
  vi.mocked(api.backupAttachmentIds).mockResolvedValue(new Set(['file']));
  expect(await gateway.cleanupAttachment('folder', 'n', 'file')).toBe(false); expect(api.deleteFile).not.toHaveBeenCalled();
});

it('reuses a confirmed existing pending upload without duplicating its file', async () => {
  await attachmentsRepo.put('file', new Blob(['bytes']));
  vi.mocked(api.fileMetadata).mockResolvedValue({ id: 'backup-file-id', name: 'old-photo-name' });
  await gateway.uploadPendingAttachments('folder', note('n', { attachments: [{ id: 'file', driveFileId: 'backup-file-id' }] }));
  expect(api.fileMetadata).toHaveBeenCalledWith('backup-file-id');
  expect(api.renameFile).toHaveBeenCalledWith('backup-file-id', 'tonote.attach.n.file');
  expect(api.uploadNamedBlob).not.toHaveBeenCalled();
  expect(await attachmentsRepo.get('file')).toBeUndefined();
});

it('trusts existing JSON references without any attachment lookups, reads or downloads', async () => {
  await gateway.uploadPendingAttachments('folder', note('n', { attachments: [{ id: 'missing', driveFileId: 'old-id' }] }));
  expect(api.findFileByName).not.toHaveBeenCalled(); expect(api.fileMetadata).not.toHaveBeenCalled();
  expect(api.downloadBlob).not.toHaveBeenCalled(); expect(api.uploadNamedBlob).not.toHaveBeenCalled();
});
it('never creates the Drive folder when Android has not initialized storage', async () => {
  vi.mocked(api.findFolder).mockResolvedValue(null);
  expect((await fullSync(gateway)).kind).toBe('readonly');
  expect(api.createFolder).not.toHaveBeenCalled(); expect(api.generateFileId).not.toHaveBeenCalled();
  expect(api.writeDocument).not.toHaveBeenCalled();
});
it('reuses backup metadata across page loads and reloads only changed or replaced snapshots', async () => {
  vi.mocked(api.fileMetadata).mockResolvedValue({ id: 'folder', name: 'Notes Backup (com.gcteam.tonote)' });
  let file = { id: 'backup-id', name: 'notes_backup.json', version: '1' };
  vi.mocked(api.findFileByName).mockImplementation(async name => name === file.name ? file : null);
  vi.mocked(api.downloadText).mockResolvedValue(JSON.stringify({ id: 'backup', version: '1', updated: 1, colors: [DEFAULT_CATEGORY], notes: [note('n')] }));
  await fullSync(gateway); await fullSync(new DriveGatewayAdapter());
  expect(api.downloadText).toHaveBeenCalledOnce(); expect(api.writeDocument).not.toHaveBeenCalled();
  file = { ...file, version: '2' };
  await fullSync(new DriveGatewayAdapter()); expect(api.downloadText).toHaveBeenCalledTimes(2);
  file = { ...file, id: 'replacement-file', version: '1' };
  await fullSync(new DriveGatewayAdapter()); expect(api.downloadText).toHaveBeenCalledTimes(3);
});
it('falls back to backup viewing when a previously cached configuration has been removed', async () => {
  await db.kv.put({ key: 'remote-config', value: { file: { id: 'removed-config', name: 'tonote.sync.json', version: '1' }, value: new FakeDrive().config!.value } });
  vi.mocked(api.fileMetadata).mockRejectedValue(new api.DriveError(404, 'Not found', 'url'));
  expect((await fullSync(gateway)).kind).toBe('readonly');
  expect(api.writeDocument).not.toHaveBeenCalled(); expect(await db.kv.get('remote-config')).toBeUndefined();
});
it('retains new local bytes after a failed upload and reuses the allocated ID on retry', async () => {
  await attachmentsRepo.put('file', new Blob(['bytes']));
  vi.mocked(api.fileMetadata).mockRejectedValue(new api.DriveError(404, 'Not found', 'url'));
  vi.mocked(api.uploadNamedBlob).mockRejectedValueOnce(new Error('Upload failed')).mockResolvedValue({ id: 'allocated-id', name: 'tonote.attach.n.file' });
  const source = note('n', { attachments: [{ id: 'file' }] });
  await expect(gateway.uploadPendingAttachments('folder', source)).rejects.toThrow('Upload failed');
  expect((await attachmentsRepo.get('file'))?.pending).toBe(true);
  await new DriveGatewayAdapter().uploadPendingAttachments('folder', source);
  expect(api.generateFileId).toHaveBeenCalledOnce();
  expect(await attachmentsRepo.get('file')).toBeUndefined();
});

it('reopening with 176 unchanged notes uses only folder/config metadata and one listing', async () => {
  const config = { schemaVersion: 3, initialized: true, trashRetentionDays: 15, colors: [DEFAULT_CATEGORY] };
  const configFile = { id: 'config', name: 'tonote.sync.json', version: '1' };
  const folderFile = { id: 'folder', name: 'Notes Backup (com.gcteam.tonote)' };
  const files = Array.from({ length: 176 }, (_, i) => ({ id: `note-${i}`, name: `tonote.note.note-${i}.json`, version: '5' }));
  vi.mocked(api.findFileByName).mockImplementation(async name => name === configFile.name ? configFile : null);
  vi.mocked(api.listChildren).mockResolvedValue(files);
  vi.mocked(api.readFile).mockImplementation(async id => ({ text: id === 'config' ? JSON.stringify(config) : serializeNote(note(id, { attachments: [{ id: `missing-${id}` }] })), etag: `"${id}"` }));
  vi.mocked(api.fileMetadata).mockImplementation(async id => {
    if (id === 'config') return configFile;
    if (id === 'folder') return folderFile;
    throw new Error(`Unexpected individual metadata request: ${id}`);
  });
  await fullSync(gateway);
  expect(api.readFile).toHaveBeenCalledTimes(177);
  expect(api.downloadBlob).not.toHaveBeenCalled(); expect(api.uploadNamedBlob).not.toHaveBeenCalled();
  expect(vi.mocked(api.findFileByName).mock.calls).toEqual([['tonote.sync.json', 'folder']]);
  // A new adapter and reopened database exercise persisted cache across page loads.
  db.close(); await db.open(); vi.clearAllMocks();
  await fullSync(new DriveGatewayAdapter());
  expect(vi.mocked(api.fileMetadata).mock.calls).toEqual([['folder'], ['config']]);
  expect(api.listChildren).toHaveBeenCalledExactlyOnceWith('folder');
  expect(api.readFile).not.toHaveBeenCalled(); expect(api.findFileByName).not.toHaveBeenCalled();
  expect(api.writeDocument).not.toHaveBeenCalled();

  // One new version downloads exactly that file, without looking up every note.
  files[82] = { ...files[82], version: '6' }; vi.clearAllMocks();
  await fullSync(new DriveGatewayAdapter());
  expect(api.readFile).toHaveBeenCalledExactlyOnceWith('note-82');
  expect(api.fileMetadata).toHaveBeenCalledTimes(2);
  expect(api.writeDocument).not.toHaveBeenCalled();
});
