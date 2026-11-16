import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db, activateAccount } from '../db/database';
import { beginSession, endSession } from '../sync/session';
import { fullSync } from '../sync/engine';
import { tryBeginFullSync } from '../sync/fullSyncThrottle';
import { syncNow, stopSyncWork } from './syncTriggers';
import { syncStore } from './syncStore';
vi.mock('../sync/engine', () => ({ fullSync: vi.fn(), sendPending: vi.fn() }));
vi.mock('../sync/driveGateway', () => ({ driveGateway: { create: () => ({}) } }));
const ok = { kind: 'ok', downloaded: 0, uploaded: 0, deleted: 0, migrated: false, deferred: 0 } as const;
let now: number;
beforeEach(async () => {
  vi.clearAllMocks(); stopSyncWork(); beginSession(); await db.delete(); await db.open();
  now = 1800000000000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  syncStore.setState({ status: 'idle', lastSyncAt: null, lastError: null, progress: null });
  vi.mocked(fullSync).mockResolvedValue(ok);
});
afterEach(() => { stopSyncWork(); endSession(); vi.restoreAllMocks(); });

it('ignores repeated refreshes for five seconds without extending the interval on each click', async () => {
  await syncNow(); await syncNow(); expect(fullSync).toHaveBeenCalledOnce();
  now += 2000; await syncNow();
  now += 2999; await syncNow(); expect(fullSync).toHaveBeenCalledOnce();
  now += 1; await syncNow(); expect(fullSync).toHaveBeenCalledTimes(2);
});
it('keeps the interval across page reloads and session restarts', async () => {
  await syncNow(); endSession(); stopSyncWork(); db.close(); await db.open(); beginSession();
  now += 1000; await syncNow(); expect(fullSync).toHaveBeenCalledOnce();
  now += 4000; await syncNow(); expect(fullSync).toHaveBeenCalledTimes(2);
});
it('also limits failed attempts while leaving their error untouched during ignored clicks', async () => {
  vi.mocked(fullSync).mockRejectedValueOnce(new Error('Network timeout'));
  await syncNow(); const previous = syncStore.getState();
  await syncNow(); expect(fullSync).toHaveBeenCalledOnce(); expect(syncStore.getState()).toBe(previous);
  now += 5000; await syncNow(); expect(fullSync).toHaveBeenCalledTimes(2);
  expect(syncStore.getState().status).toBe('idle');
});
it('atomically grants only one slot to concurrent callers, including a timestamp of zero', async () => {
  now = 0;
  const results = await Promise.all(Array.from({ length: 20 }, () => tryBeginFullSync(() => true)));
  expect(results.filter(Boolean)).toHaveLength(1);
});
it('shares the interval within an account but keeps accounts independent', async () => {
  await activateAccount('throttle-a'); expect(await tryBeginFullSync(() => true)).toBe(true);
  await activateAccount('throttle-b'); expect(await tryBeginFullSync(() => true)).toBe(true);
  await activateAccount('throttle-a'); expect(await tryBeginFullSync(() => true)).toBe(false);
});
it('does not reserve a slot for an inactive context', async () => {
  expect(await tryBeginFullSync(() => false)).toBe(false);
  expect(await tryBeginFullSync(() => true)).toBe(true);
});
it('does not lock synchronization indefinitely if the system clock moves backwards', async () => {
  expect(await tryBeginFullSync(() => true)).toBe(true);
  now -= 60000; expect(await tryBeginFullSync(() => true)).toBe(true);
  expect(await tryBeginFullSync(() => true)).toBe(false);
});
