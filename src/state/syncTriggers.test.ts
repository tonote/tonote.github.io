import 'fake-indexeddb/auto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../sync/engine', () => ({ fullSync: vi.fn(), sendPending: vi.fn() }));
vi.mock('../sync/driveGateway', () => ({ driveGateway: { create: () => ({}) } }));
vi.mock('../sync/fullSyncThrottle', () => ({ tryBeginFullSync: vi.fn() }));
import { fullSync, sendPending } from '../sync/engine';
import { beginSession, endSession } from '../sync/session';
import { syncNow, initSyncTriggers, stopSyncWork } from './syncTriggers';
import { syncStore } from './syncStore';
import { PasswordSyncError } from '../sync/gatewayTypes';
import { accessStore } from './accessStore';
import { tryBeginFullSync } from '../sync/fullSyncThrottle';
const ok = { kind: 'ok', downloaded: 0, uploaded: 0, deleted: 0, migrated: false, deferred: 0 } as const;
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); beginSession();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  syncStore.setState({ status: 'idle', lastSyncAt: null, cryptoConflict: undefined, lastError: null });
  vi.mocked(fullSync).mockResolvedValue(ok); vi.mocked(sendPending).mockResolvedValue();
  vi.mocked(tryBeginFullSync).mockResolvedValue(true);
});
afterEach(() => { dispose?.(); dispose = undefined; stopSyncWork(); endSession(); vi.useRealTimers(); });
it('refreshes once on page load and never on returning to the tab or browser', async () => {
  dispose = initSyncTriggers(); await syncNow(); expect(fullSync).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60000); expect(fullSync).toHaveBeenCalledOnce();
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange')); expect(fullSync).toHaveBeenCalledOnce();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(60000);
  expect(fullSync).toHaveBeenCalledOnce(); expect(tryBeginFullSync).toHaveBeenCalledOnce();
});
it('online and local-change events send the queue without full retrieval', async () => {
  dispose = initSyncTriggers(); await syncNow(); vi.mocked(fullSync).mockClear();
  window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(1);
  expect(sendPending).toHaveBeenCalledOnce(); expect(fullSync).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('tonote-local-change')); await vi.advanceTimersByTimeAsync(2000);
  expect(sendPending).toHaveBeenCalledTimes(2); expect(fullSync).not.toHaveBeenCalled();
});
it('coalesces active refreshes and updates the result', async () => {
  let finish!: (value: typeof ok) => void;
  vi.mocked(fullSync).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const a = syncNow(), b = syncNow(); expect(a).toBe(b);
  await Promise.resolve(); expect(syncStore.getState().status).toBe('syncing');
  finish(ok); await a; expect(syncStore.getState().lastSyncAt).not.toBeNull();
});
it('keeps password conflicts visible and does not repeatedly retry them in the background', async () => {
  vi.mocked(sendPending).mockRejectedValue(new PasswordSyncError('checker', 'salt'));
  dispose = initSyncTriggers(); await syncNow(); await vi.advanceTimersByTimeAsync(120000);
  expect(sendPending).toHaveBeenCalledOnce(); expect(syncStore.getState().status).toBe('crypto-conflict');
});
it('does not retrieve when offline or after logout', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await syncNow(); expect(fullSync).not.toHaveBeenCalled(); expect(syncStore.getState().status).toBe('offline');
  endSession(); await syncNow(); expect(fullSync).not.toHaveBeenCalled();
});
it('reports failures without marking a failed refresh successful', async () => {
  vi.mocked(fullSync).mockRejectedValue(new Error('Network timeout'));
  await syncNow(); expect(syncStore.getState().lastError).toBe('Network timeout'); expect(syncStore.getState().lastSyncAt).toBeNull();
});
it('does not check Android migration while reading a note, including visibility/online/refresh events', async () => {
  let inNote = true;
  accessStore.setState({ mode: 'readonly' });
  vi.mocked(fullSync).mockImplementation(async () => { accessStore.setState({ mode: 'readwrite' }); return ok; });
  dispose = initSyncTriggers(() => !inNote);
  await syncNow();
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('tonote-local-change'));
  await vi.advanceTimersByTimeAsync(120000);
  expect(fullSync).not.toHaveBeenCalled(); expect(sendPending).not.toHaveBeenCalled();
  expect(accessStore.getState().mode).toBe('readonly');
  inNote = false;
  expect(fullSync).not.toHaveBeenCalled(); // Navigation alone does not read Drive.
  await syncNow(); expect(fullSync).toHaveBeenCalledOnce(); expect(accessStore.getState().mode).toBe('readwrite');
});
it('does not refresh on navigation or visibility changes, but permits explicit list refresh', async () => {
  let inNote = false;
  dispose = initSyncTriggers(() => !inNote); await syncNow(); expect(fullSync).toHaveBeenCalledOnce();
  inNote = true;
  document.dispatchEvent(new Event('visibilitychange')); await syncNow();
  expect(fullSync).toHaveBeenCalledOnce();
  inNote = false;
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(10000);
  expect(fullSync).toHaveBeenCalledOnce();
  await syncNow();
  expect(fullSync).toHaveBeenCalledTimes(2);
});
it('initializes a newly opened background tab without refreshing again when it becomes visible', async () => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  dispose = initSyncTriggers();
  await vi.advanceTimersByTimeAsync(1); expect(fullSync).toHaveBeenCalledOnce();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60000); expect(fullSync).toHaveBeenCalledOnce();
});
it('refreshes on restoring the page from another site using browser back, without duplicating initial page load', async () => {
  dispose = initSyncTriggers(); await syncNow();
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
  await vi.advanceTimersByTimeAsync(6000); expect(fullSync).toHaveBeenCalledOnce();
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  await syncNow(); expect(fullSync).toHaveBeenCalledTimes(2);
});
it('clears the syncing status after navigation cancels an already running full refresh', async () => {
  vi.mocked(fullSync).mockRejectedValue(new DOMException('Viewing a note', 'AbortError'));
  await syncNow();
  expect(syncStore.getState().status).toBe('idle'); expect(syncStore.getState().lastError).toBeNull();
});
it('silently ignores a throttled refresh without changing status, progress or last sync time', async () => {
  vi.mocked(tryBeginFullSync).mockResolvedValue(false);
  syncStore.setState({ status: 'error', lastError: 'Previous error', lastSyncAt: 123, progress: null });
  const previous = syncStore.getState();
  const changed = vi.fn(), unsubscribe = syncStore.subscribe(changed);
  try {
    await syncNow(); await syncNow();
    expect(fullSync).not.toHaveBeenCalled(); expect(syncStore.getState()).toBe(previous);
    expect(changed).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});
it('does not acquire a refresh slot while offline or viewing a note', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await syncNow(); expect(tryBeginFullSync).not.toHaveBeenCalled();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  dispose = initSyncTriggers(() => false); await syncNow();
  expect(tryBeginFullSync).not.toHaveBeenCalled();
});
it('does not start Drive work if the page leaves the list while acquiring a refresh slot', async () => {
  let inNote = false;
  vi.mocked(tryBeginFullSync).mockImplementation(async () => { inNote = true; return true; });
  dispose = initSyncTriggers(() => !inNote); await syncNow();
  expect(fullSync).not.toHaveBeenCalled(); expect(syncStore.getState().status).toBe('idle');
});
