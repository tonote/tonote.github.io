import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { Blob } from 'node:buffer';
import { db } from '../db/database';
import { attachmentsRepo } from '../db/attachmentsRepo';
import { loadAttachment } from './loadAttachment';
import { downloadBlob, findFileByName, findFolder } from '../gateway/drive';
vi.mock('../gateway/drive', () => ({ downloadBlob: vi.fn(), findFileByName: vi.fn(), findFolder: vi.fn() }));
beforeEach(async () => { vi.clearAllMocks(); await db.kv.clear(); });
it('loads Android UUID files on demand without persisting downloaded bytes', async () => {
  vi.mocked(findFolder).mockResolvedValue({ id: 'folder', name: 'backup' });
  vi.mocked(findFileByName).mockResolvedValue({ id: 'remote-file', name: 'uuid' });
  vi.mocked(downloadBlob).mockResolvedValue(new Blob(['photo']) as globalThis.Blob);
  expect(await (await loadAttachment({ id: 'uuid' })).text()).toBe('photo');
  expect(findFileByName).toHaveBeenCalledWith('uuid', 'folder');
  expect(await (await loadAttachment({ id: 'uuid' })).text()).toBe('photo');
  expect(downloadBlob).toHaveBeenCalledTimes(2);
  expect(await attachmentsRepo.get('uuid')).toBeUndefined();
});
it('opens a newly added local attachment without a Drive request before upload', async () => {
  await attachmentsRepo.put('new', new Blob(['local']) as globalThis.Blob);
  expect(await (await loadAttachment({ id: 'new' })).text()).toBe('local');
  expect(findFolder).not.toHaveBeenCalled(); expect(downloadBlob).not.toHaveBeenCalled();
});
it('does not cache failed downloads, so opening again can retry', async () => {
  vi.mocked(downloadBlob).mockRejectedValue(new Error('Offline'));
  await expect(loadAttachment({ id: 'uuid', driveFileId: 'remote-file' })).rejects.toThrow('Offline');
  expect(await attachmentsRepo.get('uuid')).toBeUndefined();
});
it('looks up only owner-qualified names and historical bare UUIDs', async () => {
  vi.mocked(findFolder).mockResolvedValue({ id: 'folder', name: 'backup' });
  vi.mocked(findFileByName).mockResolvedValue(null);
  await expect(loadAttachment({ id: 'file', noteId: 'note' })).rejects.toThrow('not found');
  expect(vi.mocked(findFileByName).mock.calls).toEqual([['tonote.attach.note.file', 'folder'], ['file', 'folder']]);
});
