import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mock authStore with 'loading' status — this means AuthGuard renders AuthScreen (spinner),
// and AppShell is NOT mounted. After the fix, AppRoutes calls init() directly,
// so init() fires even though AppShell never mounts.

vi.mock('./state/authStore', () => {
  const mockInit = vi.fn().mockResolvedValue(undefined);
  const state = { status: 'loading' as const, init: mockInit };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { useAuthStore: store };
});

vi.mock('./state/syncStore', () => {
  const state = { status: 'idle', pending: 0, lastSyncAt: null };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { syncStore: store, initSyncStore: vi.fn() };
});

vi.mock('./state/settingsStore', () => {
  const state = { theme: 'light' as const, sortOrder: 'modified' as const, init: vi.fn().mockResolvedValue(undefined), setTheme: vi.fn() };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { settingsStore: store };
});

vi.mock('./state/cryptoStore', () => ({
  cryptoStore: {
    getState: () => ({ key: null, unlocked: false }),
  },
}));

vi.mock('./state/navStore', () => {
  const state = { currentFolderId: null, sidebarOpen: false, setSidebarOpen: vi.fn(), openNote: vi.fn(), selectedNoteId: null, setFolder: vi.fn() };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { navStore: store };
});

vi.mock('./state/syncTriggers', () => ({
  initSyncTriggers: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('./db/useNotes', () => ({
  useNotes: () => ({ notes: [], loading: false }),
  useNote: () => ({ note: undefined, loading: true }),
  useColors: () => ({ colors: [], loading: false }),
}));

vi.mock('./db/notesRepo', () => ({
  notesRepo: { get: vi.fn(), put: vi.fn(), all: vi.fn().mockResolvedValue([]) },
}));

vi.mock('./domain/breadcrumb', () => ({
  buildBreadcrumb: () => [],
}));

vi.mock('./db/indexMetaRepo', () => ({
  indexMetaRepo: { get: vi.fn().mockResolvedValue(undefined), set: vi.fn() },
}));

vi.mock('./crypto/passwordChange', () => ({
  changePassword: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { AppRoutes } from './router';
import { useAuthStore } from './state/authStore';

describe('AppRoutes init deadlock fix', () => {
  it('calls init() on mount even when status is loading (AppShell not mounted)', async () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/'] },
        React.createElement(AppRoutes),
      ),
    );

    // Get the mock init function from the mocked store
    const mockInitFn = useAuthStore((s: { init: ReturnType<typeof vi.fn> }) => s.init);

    await waitFor(() => {
      expect(mockInitFn).toHaveBeenCalled();
    });
  });
});
