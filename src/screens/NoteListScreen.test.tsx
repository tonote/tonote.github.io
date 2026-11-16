import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/database';
import { notesRepo } from '../db/notesRepo';
import type { Note } from '../domain/types';

vi.mock('../state/navStore', () => {
  const state = { currentFolderId: null, setFolder: vi.fn() };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { navStore: store };
});

vi.mock('../state/settingsStore', () => {
  const state = { sortOrder: 'modified' as const };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { settingsStore: store };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { NoteListScreen } from '../screens/NoteListScreen';

const defaultColor = { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 };

const makeNote = (id: string, overrides?: Partial<Note>): Note => ({
  id,
  edited: Date.now(),
  created: Date.now(),
  title: `Note ${id}`,
  content: '',
  notify: false,
  showInWidget: false,
  color: defaultColor,
  checkings: '',
  events: [],
  pinned: false,
  state: 0,
  attachments: [],
  priority: 0,
  ...overrides,
});

describe('NoteListScreen', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('renders an empty state when no notes', async () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/'] },
        React.createElement(NoteListScreen),
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('notes.empty')).toBeInTheDocument();
    });
  });

  it('renders note cards from the database', async () => {
    await notesRepo.put(makeNote('n1', { title: 'First Note' }));
    await notesRepo.put(makeNote('n2', { title: 'Second Note' }));

    render(
      React.createElement(MemoryRouter, { initialEntries: ['/'] },
        React.createElement(NoteListScreen),
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('First Note')).toBeInTheDocument();
      expect(screen.getByText('Second Note')).toBeInTheDocument();
    });
  });
});
