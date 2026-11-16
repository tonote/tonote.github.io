import { afterEach, expect, it, vi } from 'vitest';
import { Blob } from 'node:buffer';
import { uploadBlob, downloadBlob } from './drive';
vi.mock('./gis', () => ({ getAccessToken: () => 'token' }));
afterEach(() => vi.unstubAllGlobals());
it('uploads arbitrary binary bytes through the upload session', async () => {
  const file = new Blob([new Uint8Array([0, 255, 128, 1])], { type: 'application/octet-stream' });
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, headers: new Headers({ Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'uploaded' }) });
  vi.stubGlobal('fetch', fetch);
  expect(await uploadBlob('uuid', file as globalThis.Blob, 'folder')).toEqual({ id: 'uploaded' });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ name: 'uuid', parents: ['folder'] });
  const request = fetch.mock.calls[1][1];
  expect(request.method).toBe('PUT');
  expect(request.body).toBe(file);
  expect(new Uint8Array(await request.body.arrayBuffer())).toEqual(new Uint8Array([0, 255, 128, 1]));
});
it('downloads binary content without text conversion', async () => {
  const file = new Blob([new Uint8Array([255, 0])]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => file }));
  expect(await downloadBlob('file')).toBe(file);
});
it('rejects a failed upload without returning file metadata', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) }));
  await expect(uploadBlob('uuid', new Blob(['data']) as globalThis.Blob, 'folder')).rejects.toMatchObject({ status: 403 });
});
