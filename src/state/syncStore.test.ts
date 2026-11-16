import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database.js';
import { outboxRepo } from '../db/outboxRepo.js';

describe('syncStore', () => {
  let syncStore: Awaited<ReturnType<typeof import('./syncStore.js')['syncStore']['getState']>> extends never
    ? never
    : typeof import('./syncStore.js')['syncStore'];
  let initSyncStore: typeof import('./syncStore.js')['initSyncStore'];

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await db.delete();
    await db.open();
    const mod = await import('./syncStore.js');
    syncStore = mod.syncStore;
    initSyncStore = mod.initSyncStore;
    syncStore.setState({
      status: 'idle',
      lastSyncAt: null,
      pending: 0,
      lastError: null,
      cryptoConflict: undefined,
    });
  });

  it('has correct initial state', () => {
    const state = syncStore.getState();
    expect(state.status).toBe('idle');
    expect(state.lastSyncAt).toBeNull();
    expect(state.pending).toBe(0);
    expect(state.lastError).toBeNull();
    expect(state.cryptoConflict).toBeUndefined();
  });

  it('setStatus transitions to syncing', () => {
    syncStore.getState().setStatus('syncing');
    expect(syncStore.getState().status).toBe('syncing');
  });

  it('setError sets status to error and records message', () => {
    syncStore.getState().setError('network failure');
    expect(syncStore.getState().status).toBe('error');
    expect(syncStore.getState().lastError).toBe('network failure');
  });

  it('setError(null) clears error message', () => {
    syncStore.getState().setStatus('syncing');
    syncStore.getState().setError('oops');
    syncStore.getState().setError(null);
    expect(syncStore.getState().lastError).toBeNull();
  });

  it('markSynced sets status to idle, lastSyncAt to now, clears error', () => {
    syncStore.getState().setStatus('error');
    syncStore.getState().setError('some error');
    const before = Date.now();
    syncStore.getState().markSynced();
    const state = syncStore.getState();
    expect(state.status).toBe('idle');
    expect(state.lastSyncAt).not.toBeNull();
    expect(state.lastSyncAt!).toBeGreaterThanOrEqual(before);
    expect(state.lastError).toBeNull();
  });

  it('setPending updates the pending count', () => {
    syncStore.getState().setPending(5);
    expect(syncStore.getState().pending).toBe(5);
    syncStore.getState().setPending(0);
    expect(syncStore.getState().pending).toBe(0);
  });

  it('setCryptoConflict records remote checker and salt', () => {
    syncStore.getState().setCryptoConflict({
      remoteChecker: 'abc123',
      remoteSalt: 'xyz789',
    });
    const state = syncStore.getState();
    expect(state.status).toBe('crypto-conflict');
    expect(state.cryptoConflict).toEqual({
      remoteChecker: 'abc123',
      remoteSalt: 'xyz789',
    });
  });

  it('clearCryptoConflict removes crypto conflict info', () => {
    syncStore.getState().setCryptoConflict({
      remoteChecker: 'abc',
      remoteSalt: 'xyz',
    });
    syncStore.getState().clearCryptoConflict();
    expect(syncStore.getState().cryptoConflict).toBeUndefined();
  });

  it('initSyncStore subscribes pending to outbox count', async () => {
    initSyncStore();
    // Add outbox entries
    await outboxRepo.enqueue({ noteId: 'n1', op: 'upsert', queuedAt: 100 });
    await outboxRepo.enqueue({ noteId: 'n2', op: 'delete', queuedAt: 200 });
    // Wait for liveQuery to fire
    await new Promise((r) => setTimeout(r, 100));
    expect(syncStore.getState().pending).toBe(2);
    // Clear outbox
    await outboxRepo.clear();
    await new Promise((r) => setTimeout(r, 100));
    expect(syncStore.getState().pending).toBe(0);
  });
});
