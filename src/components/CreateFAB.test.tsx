import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import 'fake-indexeddb/auto';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('../state/navStore', () => {
  const state = { openNote: vi.fn(), currentFolderId: null };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { navStore: store };
});

vi.mock('../state/settingsStore', () => {
  const state = { sortOrder: 'modified' };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { settingsStore: store };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { db } from '../db/database';
import { notesRepo } from '../db/notesRepo';
import { CreateFAB } from '../components/CreateFAB';

describe('CreateFAB', () => {
  it('renders a + button', () => {
    render(
      React.createElement(MemoryRouter, {},
        React.createElement(CreateFAB),
      ),
    );

    expect(screen.getByLabelText('notes.new_note')).toBeInTheDocument();
  });

  it('opens a menu on click', () => {
    render(
      React.createElement(MemoryRouter, {},
        React.createElement(CreateFAB),
      ),
    );

    fireEvent.click(screen.getByLabelText('notes.new_note'));

    expect(screen.getByText('notes.create_text')).toBeInTheDocument();
    expect(screen.getByText('notes.create_checklist')).toBeInTheDocument();
    expect(screen.getByText('notes.create_rich')).toBeInTheDocument();
    expect(screen.getByText('notes.create_folder')).toBeInTheDocument();
  });

  it('opens a text draft without writing an empty note', async () => {
    await db.delete();
    await db.open();

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(CreateFAB),
      ),
    );

    fireEvent.click(screen.getByLabelText('notes.new_note'));
    fireEvent.click(screen.getByText('notes.create_text'));

    // Check db has the note
    const notes = await notesRepo.all();
    expect(notes).toHaveLength(0);
    expect(navigate).toHaveBeenLastCalledWith('/note/new?kind=plain');
  });

  it('creates a checklist note with empty checkings', async () => {
    await db.delete();
    await db.open();

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(CreateFAB),
      ),
    );

    fireEvent.click(screen.getByLabelText('notes.new_note'));
    fireEvent.click(screen.getByText('notes.create_checklist'));

    const notes = await notesRepo.all();
    expect(notes).toHaveLength(0);
    expect(navigate).toHaveBeenLastCalledWith('/note/new?kind=list');
  });

  it('creates a rich note with h checkings', async () => {
    await db.delete();
    await db.open();

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(CreateFAB),
      ),
    );

    fireEvent.click(screen.getByLabelText('notes.new_note'));
    fireEvent.click(screen.getByText('notes.create_rich'));

    const notes = await notesRepo.all();
    expect(notes).toHaveLength(0);
    expect(navigate).toHaveBeenLastCalledWith('/note/new?kind=rich');
  });

  it('creates a folder note with f checkings', async () => {
    await db.delete();
    await db.open();

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(CreateFAB),
      ),
    );

    fireEvent.click(screen.getByLabelText('notes.new_note'));
    fireEvent.click(screen.getByText('notes.create_folder'));

    const notes = await notesRepo.all();
    expect(notes).toHaveLength(0);
    expect(navigate).toHaveBeenLastCalledWith('/note/new?kind=folder');
  });
});

it('passes the category filter and folder to the new draft', () => {
  render(<MemoryRouter><CreateFAB folderId="folder" colorId="work" /></MemoryRouter>);
  fireEvent.click(screen.getByLabelText('notes.new_note'));
  fireEvent.click(screen.getByText('notes.create_text'));
  expect(navigate).toHaveBeenLastCalledWith('/note/new?kind=plain&color=work&parent=folder');
});
