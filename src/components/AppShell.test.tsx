import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Link, MemoryRouter } from 'react-router-dom';
import { initSyncTriggers } from '../state/syncTriggers';
import { accessStore } from '../state/accessStore';

// Mock stores
vi.mock('../state/authStore', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      status: 'signed-in',
      email: 'test@example.com',
      init: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock('../state/syncStore', () => {
  const state = { status: 'idle', pending: 0, lastSyncAt: null };
  const store = Object.assign((selector: (s: typeof state) => unknown) => selector(state), state);
  return { syncStore: store, initSyncStore: vi.fn() };
});

vi.mock('../state/settingsStore', () => {
  const state = { theme: 'light', sortOrder: 'modified', init: vi.fn().mockResolvedValue(undefined), setTheme: vi.fn() };
  const store = Object.assign((selector: (s: typeof state) => unknown) => selector(state), state);
  return { settingsStore: store };
});

vi.mock('../state/cryptoStore', () => ({
  cryptoStore: {
    getState: () => ({ key: null, unlocked: false }),
  },
}));

vi.mock('../state/navStore', () => {
  const state = { currentFolderId: null, sidebarOpen: false, setSidebarOpen: vi.fn() };
  const store = Object.assign((selector: (s: typeof state) => unknown) => selector(state), state);
  return { navStore: store };
});

vi.mock('../state/syncTriggers', () => ({
  initSyncTriggers: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('../db/useNotes', () => ({
  useNotes: () => ({ notes: [], loading: false }),
  useNote: () => ({ note: undefined, loading: true }),
  useColors: () => ({ colors: [], loading: false }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { AppShell } from '../components/AppShell';

describe('AppShell', () => {
  it('allows full refresh only outside a note and does not restart synchronization on navigation', () => {
    accessStore.setState({ mode: 'readonly' }); vi.mocked(initSyncTriggers).mockClear();
    render(<MemoryRouter initialEntries={['/note/n']}>
      <AppShell /><Link to="/">Return to list</Link><Link to="/note/other">Open another note</Link>
    </MemoryRouter>);
    const canRefresh = vi.mocked(initSyncTriggers).mock.calls[0][0]!;
    expect(canRefresh()).toBe(false); expect(screen.queryByRole('button', { name: 'sync.refresh' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Return to list' }));
    expect(canRefresh()).toBe(true); expect(screen.getByRole('button', { name: 'sync.refresh' })).toBeVisible();
    fireEvent.click(screen.getByRole('link', { name: 'Open another note' }));
    expect(canRefresh()).toBe(false); expect(initSyncTriggers).toHaveBeenCalledOnce();
  });
  it('renders an Outlet placeholder area', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        React.createElement(AppShell),
      ),
    );

    // The AppShell should render the Outlet — in MemoryRouter without routes
    // the Outlet just renders nothing, but the layout structure should exist
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders the TopBar with logo', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        React.createElement(AppShell),
      ),
    );

    expect(screen.getByText('app.title')).toBeInTheDocument();
  });

  it('renders the Sidebar navigation', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        React.createElement(AppShell),
      ),
    );

    expect(screen.getByText('nav.all_notes')).toBeInTheDocument();
    expect(screen.getByText('nav.archive')).toBeInTheDocument();
    expect(screen.getByText('nav.trash')).toBeInTheDocument();
    expect(screen.getByText('nav.settings')).toBeInTheDocument();
  });
});
