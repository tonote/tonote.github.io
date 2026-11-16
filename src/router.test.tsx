import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mock all stores
vi.mock('./state/authStore', () => {
  const state = { status: 'signed-in' as const, email: 'test@test.com', init: vi.fn().mockResolvedValue(undefined) };
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

vi.mock('./state/cryptoStore', () => {
  const state = { unlocked: false, key: null };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state, {
    getState: () => state,
  });
  return { cryptoStore: store };
});

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

describe('Router', () => {
  it('renders note list screen at /', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/'] },
        React.createElement(AppRoutes),
      ),
    );
    expect(screen.getByText('notes.empty')).toBeInTheDocument();
  });

  it('renders note list at /folder/:id', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/folder/folder1'] },
        React.createElement(AppRoutes),
      ),
    );
    expect(screen.getByText('notes.empty')).toBeInTheDocument();
  });

  it('renders archive at /archive', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/archive'] },
        React.createElement(AppRoutes),
      ),
    );
    expect(screen.getByText('notes.empty')).toBeInTheDocument();
  });

  it('renders trash at /trash', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/trash'] },
        React.createElement(AppRoutes),
      ),
    );
    expect(screen.getByText('notes.empty')).toBeInTheDocument();
  });

  it('renders settings screen at /settings', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/settings'] },
        React.createElement(AppRoutes),
      ),
    );
    expect(screen.getByText('settings.title')).toBeInTheDocument();
  });

  it('renders search screen at /search', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/search?q=test'] },
        React.createElement(AppRoutes),
      ),
    );
    // SearchScreen with q=test and no notes: shows results_count + no_results
    expect(screen.getByText('search.results_count')).toBeInTheDocument();
    expect(screen.getByText('search.no_results')).toBeInTheDocument();
  });

  it('renders secured screen at /secured', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/secured'] },
        React.createElement(AppRoutes),
      ),
    );
    // When not unlocked, shows unlock required message
    expect(screen.getByText('secured.unlock_required')).toBeInTheDocument();
  });

  it('renders color notes screen at /color/:id', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/color/c1'] },
        React.createElement(AppRoutes),
      ),
    );
    expect(screen.getByText('notes.empty')).toBeInTheDocument();
  });
});
