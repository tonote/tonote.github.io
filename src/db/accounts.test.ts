import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { db, activateAccount } from './database';
import { saveNote } from '../sync/local';
import { note } from '../sync/testing';
import { beginSession, endSession } from '../sync/session';
import { FakeDrive } from '../sync/testing';
import { fullSync, exclusive } from '../sync/engine';

it('isolates notes, queue, encryption metadata and cache between Google accounts', async () => {
  await activateAccount('account-a-test'); await db.delete(); await db.open();
  await saveNote(note('private'));
  await db.kv.put({ key: 'attachment:file', value: { bytes: 'private' } });
  await db.indexMeta.put({ key: 'current', salt: 'AQ==', checker: 'Ag==' });
  await activateAccount('account-b-test'); await db.delete(); await db.open();
  expect(await db.notes.count()).toBe(0); expect(await db.outbox.count()).toBe(0); expect(await db.kv.count()).toBe(0); expect(await db.indexMeta.count()).toBe(0);
  await activateAccount('account-a-test');
  expect(await db.notes.get('private')).toBeDefined(); expect(await db.outbox.count()).toBe(1); expect(await db.indexMeta.get('current')).toMatchObject({ salt: 'AQ==' });
});
it('drains an invalidated sync before switching account databases', async () => {
  beginSession(); await db.delete(); await db.open();
  const drive = new FakeDrive(); drive.seed(note('remote-private'));
  drive.afterRead = async () => { endSession(); };
  const pending = fullSync(drive);
  await expect(pending).rejects.toThrow('session');
  await exclusive(() => activateAccount('next-account-test'));
  expect(await db.notes.get('remote-private')).toBeUndefined();
});
