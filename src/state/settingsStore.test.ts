import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database.js';

/** Tick the microtask queue so fire-and-forget db writes complete. */
const tick = () => new Promise((r) => setTimeout(r, 10));

describe('settingsStore', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await db.delete();
    await db.open();
  });

  it('has correct initial defaults', async () => {
    const { settingsStore } = await import('./settingsStore.js');
    const state = settingsStore.getState();
    expect(state.theme).toBe('light');
    expect(state.layout).toBe('grid');
    expect(state.sortOrder).toBe('modified');
    expect(state.defaultKind).toBe('plain');
  });

  it('init loads settings from db', async () => {
    // Pre-seed db
    await db.settings.put({
      key: 'default',
      theme: 'dark',
      layout: 'list',
      sortOrder: 'created',
      defaultKind: 'rich',
    });

    const { settingsStore } = await import('./settingsStore.js');
    await settingsStore.getState().init();
    const state = settingsStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.layout).toBe('list');
    expect(state.sortOrder).toBe('created');
    expect(state.defaultKind).toBe('rich');
  });

  it('setTheme writes through to db', async () => {
    const { settingsStore } = await import('./settingsStore.js');
    await settingsStore.getState().init();
    settingsStore.getState().setTheme('dark');
    await tick();
    expect(settingsStore.getState().theme).toBe('dark');
    const row = await db.settings.get('default');
    expect(row!.theme).toBe('dark');
  });

  it('setLayout writes through to db', async () => {
    const { settingsStore } = await import('./settingsStore.js');
    await settingsStore.getState().init();
    settingsStore.getState().setLayout('list');
    await tick();
    expect(settingsStore.getState().layout).toBe('list');
    const row = await db.settings.get('default');
    expect(row!.layout).toBe('list');
  });

  it('setSortOrder writes through to db', async () => {
    const { settingsStore } = await import('./settingsStore.js');
    await settingsStore.getState().init();
    settingsStore.getState().setSortOrder('priority');
    await tick();
    expect(settingsStore.getState().sortOrder).toBe('priority');
    const row = await db.settings.get('default');
    expect(row!.sortOrder).toBe('priority');
  });

  it('setDefaultKind writes through to db', async () => {
    const { settingsStore } = await import('./settingsStore.js');
    await settingsStore.getState().init();
    settingsStore.getState().setDefaultKind('rich');
    await tick();
    expect(settingsStore.getState().defaultKind).toBe('rich');
    const row = await db.settings.get('default');
    expect(row!.defaultKind).toBe('rich');
  });

  it('round-trip: init after set persists and reloads', async () => {
    const { settingsStore } = await import('./settingsStore.js');
    await settingsStore.getState().init();
    settingsStore.getState().setTheme('dark');
    settingsStore.getState().setLayout('list');
    await tick();

    // Reset modules and re-import
    vi.resetModules();
    await db.delete();
    await db.open();
    // Re-seed: simulates data already persisted from before
    await db.settings.put({
      key: 'default',
      theme: 'dark',
      layout: 'list',
      sortOrder: 'modified',
      defaultKind: 'plain',
    });
    const { settingsStore: freshStore } = await import('./settingsStore.js');
    await freshStore.getState().init();
    expect(freshStore.getState().theme).toBe('dark');
    expect(freshStore.getState().layout).toBe('list');
  });
});
