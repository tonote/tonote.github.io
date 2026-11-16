import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('navStore', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('has correct initial state', async () => {
    const { navStore } = await import('./navStore.js');
    const state = navStore.getState();
    expect(state.currentFolderId).toBeNull();
    expect(state.selectedNoteId).toBeNull();
    expect(state.viewMode).toBe('grid');
  });

  it('setFolder updates currentFolderId', async () => {
    const { navStore } = await import('./navStore.js');
    navStore.getState().setFolder('folder-1');
    expect(navStore.getState().currentFolderId).toBe('folder-1');
  });

  it('setFolder(null) navigates to root', async () => {
    const { navStore } = await import('./navStore.js');
    navStore.getState().setFolder('folder-1');
    navStore.getState().setFolder(null);
    expect(navStore.getState().currentFolderId).toBeNull();
  });

  it('openNote updates selectedNoteId', async () => {
    const { navStore } = await import('./navStore.js');
    navStore.getState().openNote('note-42');
    expect(navStore.getState().selectedNoteId).toBe('note-42');
  });

  it('openNote(null) deselects note', async () => {
    const { navStore } = await import('./navStore.js');
    navStore.getState().openNote('note-42');
    navStore.getState().openNote(null);
    expect(navStore.getState().selectedNoteId).toBeNull();
  });

  it('setViewMode updates viewMode', async () => {
    const { navStore } = await import('./navStore.js');
    navStore.getState().setViewMode('list');
    expect(navStore.getState().viewMode).toBe('list');
    navStore.getState().setViewMode('grid');
    expect(navStore.getState().viewMode).toBe('grid');
  });
});
