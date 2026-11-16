import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { TonoteDB } from './database';
import { note } from '../sync/testing';

it('upgrades old caches by dropping downloaded/uploaded bytes while preserving pending new files and notes', async () => {
  const name = 'attachment-cache-upgrade-test';
  const legacy = new Dexie(name);
  legacy.version(1).stores({ notes: 'id, edited, state, parentId, pinned', colors: 'id, priority', indexMeta: 'key', outbox: '++seq, noteId, op, queuedAt', settings: 'key', kv: 'key' });
  legacy.version(2).stores({ syncRecords: 'id', cleanup: 'id, noteId' });
  await legacy.open();
  await legacy.table('notes').put(note('n', { attachments: [{ id: 'new' }, { id: 'downloaded' }] }));
  await legacy.table('outbox').add({ noteId: 'n', op: 'upsert', queuedAt: 1 });
  await legacy.table('kv').bulkPut([
    { key: 'attachment:downloaded', value: { blob: new Blob(['cached']), pending: false } },
    { key: 'attachment:new', value: { blob: new Blob(['new']), pending: true } },
    { key: 'sync-folder', value: 'folder' },
  ]);
  legacy.close();
  const upgraded = new TonoteDB(name);
  try {
    await upgraded.open();
    expect(await upgraded.kv.get('attachment:downloaded')).toBeUndefined();
    expect((await upgraded.kv.get('attachment:new'))?.value).toMatchObject({ pending: true });
    expect(await upgraded.kv.get('sync-folder')).toMatchObject({ value: 'folder' });
    expect(await upgraded.notes.get('n')).toMatchObject({ attachments: [{ id: 'new' }, { id: 'downloaded' }] });
    expect(await upgraded.outbox.count()).toBe(1);
  } finally { await upgraded.delete(); }
});
