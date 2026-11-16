import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFile, writeDocument, DriveError } from './drive';
import { beginSession } from '../sync/session';
vi.mock('./gis', () => ({ getAccessToken: () => 'token' }));
beforeEach(() => beginSession()); afterEach(() => vi.unstubAllGlobals());
it('uses the returned ETag in If-Match and surfaces a stale-write rejection', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{"id":"n"}', { headers: { ETag: '"old"' } }))
    .mockResolvedValueOnce(new Response('{"error":{"message":"stale"}}', { status: 412 }));
  vi.stubGlobal('fetch', fetch);
  const read = await readFile('n');
  await expect(writeDocument('n.json', '{"id":"n"}', 'folder', 'n', { id: 'n', name: 'n.json', etag: read.etag })).rejects.toMatchObject({ status: 412 });
  expect((fetch.mock.calls[1][1].headers as Headers).get('If-Match')).toBe('"old"');
});
it('sends a preallocated ID on creation and verifies a 409 before acknowledging it', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{"error":{}}', { status: 409 }))
    .mockResolvedValueOnce(new Response('{"id":"wrong"}'));
  vi.stubGlobal('fetch', fetch);
  await expect(writeDocument('n.json', '{"id":"n"}', 'folder', 'allocated')).rejects.toThrow('different');
  expect(fetch.mock.calls[0][1].body).toContain('"id":"allocated"');
  expect(DriveError).toBeDefined();
});
