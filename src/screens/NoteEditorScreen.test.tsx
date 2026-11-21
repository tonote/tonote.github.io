import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/database';
import { notesRepo } from '../db/notesRepo';
import type { Note } from '../domain/types';

vi.mock('../sync/driveGateway', () => ({
  DriveGatewayAdapter: vi.fn(),
  driveGateway: { create: () => ({}) },
}));

vi.mock('../sync/editSync', () => ({
  scheduleNoteSync: vi.fn(),
  cancelNoteSync: vi.fn(),
}));

vi.mock('../crypto/noteCrypto', () => ({
  encryptNote: vi.fn(),
  decryptNote: vi.fn(),
  withFreshIv: vi.fn(),
}));

vi.mock('../domain/folders', async () => {
  const actual = await vi.importActual<typeof import('../domain/folders')>('../domain/folders');
  return {
    ...actual,
    canMoveTo: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../state/syncStore', () => {
  const state = { status: 'idle' as const, cryptoConflict: undefined };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { syncStore: store };
});

vi.mock('../state/syncTriggers', () => ({
  syncNow: vi.fn(),
}));

vi.mock('../state/navStore', () => {
  const state = { openNote: vi.fn(), selectedNoteId: null };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { navStore: store };
});

vi.mock('../state/settingsStore', () => {
  const state = { sortOrder: 'modified' as const };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { settingsStore: store };
});

vi.mock('../state/cryptoStore', () => {
  const state = { unlocked: false, key: null };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state, {
    getState: () => state,
  });
  return { cryptoStore: store };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { resolvedLanguage: 'en' } }),
}));

import { NoteEditorScreen } from '../screens/NoteEditorScreen';

const defaultColor = { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 };

const makeNote = (id: string, overrides?: Partial<Note>): Note => ({
  id,
  edited: Date.now(),
  created: Date.now(),
  title: 'Test Note',
  content: 'Hello world',
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

describe('NoteEditorScreen', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('renders a loading state initially', () => {
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/note/nonexistent'] },
        React.createElement(NoteEditorScreen, { id: 'nonexistent' }),
      ),
    );
    // Just verify it doesn't crash
  });

  it('renders by note id', async () => {
    await notesRepo.put(makeNote('abc'));

    render(
      React.createElement(MemoryRouter, { initialEntries: ['/note/abc'] },
        React.createElement(NoteEditorScreen, { id: 'abc' }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Note')).toBeInTheDocument();
    });
  });

  it('keeps edits in memory until Save is clicked', async () => {
    await notesRepo.put(makeNote('abc'));

    render(
      React.createElement(MemoryRouter, { initialEntries: ['/note/abc'] },
        React.createElement(NoteEditorScreen, { id: 'abc' }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Note')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('editor.title_placeholder') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });

    await new Promise((r) => setTimeout(r, 600));
    expect((await notesRepo.get('abc'))?.title).toBe('Test Note');
    fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
    await waitFor(async () => expect((await notesRepo.get('abc'))?.title).toBe('Updated Title'));
  });

  it('encrypted note with locked store shows unlock prompt, not editor body', async () => {
    // Seed an encrypted note
    await notesRepo.put(makeNote('enc-1', { iv: 'some-base64-iv' }));

    // cryptoStore mock has unlocked=false by default
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/note/enc-1'] },
        React.createElement(NoteEditorScreen, { id: 'enc-1' }),
      ),
    );

    // Should show locked state prompt (not the editor body)
    await waitFor(() => {
      expect(screen.getByText('notes.locked_message')).toBeInTheDocument();
    });

    // The editor body (plaintext content) should NOT be present
    expect(screen.queryByDisplayValue('Test Note')).not.toBeInTheDocument();
  });

  it('does not overwrite the draft when a remote update refreshes the same note', async () => {
    // Seed a plain note
    await notesRepo.put(makeNote('autosave-test', { title: 'Original Title' }));

    render(
      React.createElement(MemoryRouter, { initialEntries: ['/note/autosave-test'] },
        React.createElement(NoteEditorScreen, { id: 'autosave-test' }),
      ),
    );

    // Wait for initial load — title should be "Original Title"
    await waitFor(() => {
      expect(screen.getByDisplayValue('Original Title')).toBeInTheDocument();
    });

    // Simulate user typing in the title — local state changes to "User Typed Title"
    const titleInput = screen.getByPlaceholderText('editor.title_placeholder') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'User Typed Title' } });
    expect(titleInput.value).toBe('User Typed Title');

    // Now simulate what happens after autosave: the liveQuery refires with
    // a note that has a different title from what the user is typing.
    // This would happen if e.g. a remote sync updated the note, or the
    // autosave wrote the user's value but liveQuery returned a slightly
    // stale version.  The key point: same note id should NOT reset local state.
    //
    // Update the DB behind the scenes with a different title (simulating a stale
    // liveQuery re-fire with the same id but different content).
    await notesRepo.put(makeNote('autosave-test', { title: 'DB Overwritten Title' }));

    // Wait for liveQuery to potentially propagate
    await new Promise((r) => setTimeout(r, 100));

    // The editor should still show the user's local value, NOT the db value,
    // because the note identity (id) hasn't changed.
    expect(titleInput.value).toBe('User Typed Title');
  });

  it('does reload local state when switching to a different note id', async () => {
    // Seed two notes
    await notesRepo.put(makeNote('note-a', { title: 'Note A' }));
    await notesRepo.put(makeNote('note-b', { title: 'Note B' }));

    // Render with note-a
    const { rerender } = render(
      React.createElement(MemoryRouter, { initialEntries: ['/note/note-a'] },
        React.createElement(NoteEditorScreen, { id: 'note-a' }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Note A')).toBeInTheDocument();
    });

    // Switch to note-b
    rerender(
      React.createElement(MemoryRouter, { initialEntries: ['/note/note-b'] },
        React.createElement(NoteEditorScreen, { id: 'note-b' }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Note B')).toBeInTheDocument();
    });
  });

  it('deleting a folder cascades PARENT_REMOVED to descendants', async () => {
    // Seed a folder with 2 children + 1 grandchild
    await notesRepo.put(makeNote('folder-1', { checkings: 'f', parentId: undefined }));
    await notesRepo.put(makeNote('child-1', { parentId: 'folder-1' }));
    await notesRepo.put(makeNote('child-2', { parentId: 'folder-1' }));
    await notesRepo.put(makeNote('grandchild-1', { parentId: 'child-1' }));

    render(
      React.createElement(MemoryRouter, { initialEntries: ['/note/folder-1'] },
        React.createElement(NoteEditorScreen, { id: 'folder-1' }),
      ),
    );

    // Wait for the editor to render
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Note')).toBeInTheDocument();
    });

    // Open action menu and click delete
    const menuToggle = screen.getByLabelText('common.actions');
    fireEvent.click(menuToggle);

    const deleteButton = screen.getByText('notes.delete');
    fireEvent.click(deleteButton);

    // Wait for navigation + db write
    await new Promise((r) => setTimeout(r, 100));

    // Verify cascade: descendants should be PARENT_REMOVED
    const { NOTE_STATE } = await import('../domain/types');
    const after = await notesRepo.all();

    const folder = after.find(n => n.id === 'folder-1');
    expect(folder!.state).toBe(NOTE_STATE.REMOVED);

    const child1 = after.find(n => n.id === 'child-1');
    expect(child1!.state).toBe(NOTE_STATE.PARENT_REMOVED);

    const child2 = after.find(n => n.id === 'child-2');
    expect(child2!.state).toBe(NOTE_STATE.PARENT_REMOVED);

    const grandchild = after.find(n => n.id === 'grandchild-1');
    expect(grandchild!.state).toBe(NOTE_STATE.PARENT_REMOVED);
  });
});

it('does not save a new empty note and persists a filled draft only once', async () => {
  await db.delete(); await db.open();
  render(<MemoryRouter initialEntries={['/note/new?kind=plain']}><NoteEditorScreen id="new" /></MemoryRouter>);
  const title = await screen.findByLabelText('editor.title_placeholder');
  expect(screen.getByRole('button', { name: 'notes.save' })).toBeDisabled();
  expect(await notesRepo.all()).toHaveLength(0);
  fireEvent.change(title, { target: { value: 'New note' } });
  expect(await notesRepo.all()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
  await waitFor(async () => expect(await notesRepo.all()).toHaveLength(1));
  expect((await notesRepo.all())[0].title).toBe('New note');
});

it('closing an edited note offers discard without changing the stored note', async () => {
  await db.delete(); await db.open(); await notesRepo.put(makeNote('discard'));
  render(<MemoryRouter><NoteEditorScreen id="discard" /></MemoryRouter>);
  const title = await screen.findByDisplayValue('Test Note');
  fireEvent.change(title, { target: { value: 'Not saved' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'editor.discard' }));
  expect((await notesRepo.get('discard'))?.title).toBe('Test Note');
});

it('saving an encrypted edit writes ciphertext using the latest draft', async () => {
  const { cryptoStore } = await import('../state/cryptoStore');
  const { decryptNote, encryptNote, withFreshIv } = await import('../crypto/noteCrypto');
  const state = cryptoStore.getState();
  const original = { ...state };
  Object.assign(state, { unlocked: true, key: new Uint8Array(16) });
  vi.mocked(decryptNote).mockImplementation(async (note) => ({ ...note, title: 'Decrypted', content: 'Original' }));
  vi.mocked(withFreshIv).mockImplementation((note) => ({ ...note, iv: 'fresh-iv' }));
  vi.mocked(encryptNote).mockImplementation(async (note) => ({ ...note, title: 'cipher-title', content: 'cipher-body' }));
  try {
    await db.delete(); await db.open(); await notesRepo.put(makeNote('encrypted', { iv: 'old-iv', title: 'cipher' }));
    render(<MemoryRouter><NoteEditorScreen id="encrypted" /></MemoryRouter>);
    fireEvent.change(await screen.findByDisplayValue('Decrypted'), { target: { value: 'Secret edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
    await waitFor(async () => expect((await notesRepo.get('encrypted'))?.title).toBe('cipher-title'));
    expect(encryptNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Secret edit', iv: 'fresh-iv' }), state.key);
  } finally { Object.assign(state, original); }
});

it('adds attachments only on Save and removes references only on Save', async () => {
  await db.delete(); await db.open();
  const { attachmentsRepo } = await import('../db/attachmentsRepo');
  render(<MemoryRouter><NoteEditorScreen id="new" /></MemoryRouter>);
  await screen.findByLabelText('editor.title_placeholder');
  const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
  expect(screen.getByText('hello.txt')).toBeInTheDocument();
  expect(await notesRepo.all()).toHaveLength(0);
  expect(await db.kv.count()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
  await waitFor(async () => expect(await notesRepo.all()).toHaveLength(1));
  const saved = (await notesRepo.all())[0];
  expect(saved.attachments[0]).toMatchObject({ name: 'hello.txt', type: 1, noteId: saved.id });
  expect((await attachmentsRepo.get(saved.attachments[0].id))?.pending).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'attachments.remove' }));
  expect((await notesRepo.get(saved.id))?.attachments).toHaveLength(1);
});

it.each([1, 2, 3] as const)('state %s is read-only and permits viewing attachments', async state => {
  await db.delete(); await db.open();
  await notesRepo.put(makeNote('readonly', { state, attachments: [{ id: 'file', name: 'file.txt' }] }));
  render(<MemoryRouter><NoteEditorScreen id="readonly" /></MemoryRouter>);
  const title = await screen.findByDisplayValue('Test Note');
  expect(title).toHaveAttribute('readonly');
  expect(screen.getByDisplayValue('Hello world')).toHaveAttribute('readonly');
  fireEvent.change(title, { target: { value: 'Should not change' } });
  expect(title).toHaveValue('Test Note');
  expect(screen.queryByRole('button', { name: 'notes.save' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'common.actions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'attachments.add' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'attachments.remove' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'file.txt' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'notes.restore' })).toBeEnabled();
  expect(screen.getByRole('button', { name: state === 1 ? 'notes.delete' : 'notes.delete_forever' })).toBeEnabled();
});

it('restores an archived note without changing its content', async () => {
  vi.clearAllMocks();
  await db.delete(); await db.open();
  await notesRepo.put(makeNote('archived', { state: 1 }));
  render(<MemoryRouter><NoteEditorScreen id="archived" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'notes.restore' }));
  await waitFor(async () => expect((await notesRepo.get('archived'))?.state).toBe(0));
  expect((await notesRepo.get('archived'))?.content).toBe('Hello world');
  const { scheduleNoteSync } = await import('../sync/editSync');
  const { syncNow } = await import('../state/syncTriggers');
  await waitFor(() => expect(scheduleNoteSync).toHaveBeenCalledWith('archived', expect.anything()));
  expect(syncNow).not.toHaveBeenCalled();
});

it.each(['trash', 'restore'] as const)('%s synchronizes only the folder and affected descendants', async action => {
  vi.clearAllMocks();
  await db.delete(); await db.open();
  await notesRepo.bulkPut([
    makeNote('folder', { checkings: 'f', state: action === 'trash' ? 0 : 2 }),
    makeNote('child', { parentId: 'folder', state: action === 'trash' ? 0 : 3 }),
    makeNote('already-trashed', { parentId: 'folder', state: 2 }),
    makeNote('unrelated'),
  ]);
  render(<MemoryRouter><NoteEditorScreen id="folder" /></MemoryRouter>);
  if (action === 'trash') fireEvent.click(await screen.findByLabelText('common.actions'));
  fireEvent.click(await screen.findByRole('button', { name: action === 'trash' ? 'notes.delete' : 'notes.restore' }));
  const { scheduleNoteSync } = await import('../sync/editSync');
  const { syncNow } = await import('../state/syncTriggers');
  await waitFor(() => expect(scheduleNoteSync).toHaveBeenCalledTimes(2));
  expect(scheduleNoteSync).toHaveBeenCalledWith('folder', expect.anything());
  expect(scheduleNoteSync).toHaveBeenCalledWith('child', expect.anything());
  expect(syncNow).not.toHaveBeenCalled();
});

it('requires confirmation before permanently deleting a trashed note', async () => {
  await db.delete(); await db.open();
  await notesRepo.put(makeNote('trash', { state: 2 }));
  render(<MemoryRouter><NoteEditorScreen id="trash" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'notes.delete_forever' }));
  expect(await notesRepo.get('trash')).toBeDefined();
  const dialog = screen.getByRole('dialog');
  fireEvent.click(dialog.querySelector('.danger-btn')!);
  await waitFor(async () => expect(await notesRepo.get('trash')).toBeUndefined());
  expect(await db.outbox.toArray()).toEqual([expect.objectContaining({ noteId: 'trash', op: 'delete' })]);
});

it('archives a note with unsaved edits and queues synchronization', async () => {
  await db.delete(); await db.open();
  await notesRepo.put(makeNote('to-archive'));
  render(<MemoryRouter><NoteEditorScreen id="to-archive" /></MemoryRouter>);
  fireEvent.change(await screen.findByDisplayValue('Test Note'), { target: { value: 'Edited before archiving' } });
  fireEvent.click(screen.getByLabelText('common.actions'));
  fireEvent.click(screen.getByRole('button', { name: 'notes.archive' }));
  await waitFor(async () => expect(await notesRepo.get('to-archive')).toMatchObject({ state: 1, title: 'Edited before archiving' }));
  const { scheduleNoteSync } = await import('../sync/editSync');
  expect(scheduleNoteSync).toHaveBeenCalledWith('to-archive', expect.anything());
});

it('hides note-only actions and attachments for folders', async () => {
  await db.delete(); await db.open();
  await notesRepo.put(makeNote('folder', { checkings: 'f' }));
  render(<MemoryRouter><NoteEditorScreen id="folder" /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('common.actions'));
  expect(screen.queryByRole('button', { name: 'notes.archive' })).not.toBeInTheDocument();
  for (const name of ['export.title', 'notes.encrypt', 'notes.decrypt', 'notes.create_text', 'notes.create_rich', 'notes.create_checklist', 'attachments.add']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
  expect(document.querySelector('input[type=file]')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'notes.delete' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'notes.move' })).toBeInTheDocument();
});

it('uses current category settings for the selected category', async () => {
  await db.delete(); await db.open();
  const category = { ...defaultColor, value: -394759, theme: 'Current' };
  await db.colors.put(category);
  await notesRepo.put(makeNote('category-note', { color: { ...category, value: -1, theme: 'Stale' } }));
  render(<MemoryRouter><NoteEditorScreen id="category-note" /></MemoryRouter>);
  const button = await screen.findByRole('button', { name: 'colors.title: Current' });
  expect(button.querySelector('.color-dot')).toHaveStyle({ background: 'var(--category-default)' });
  await db.colors.update(category.id, { value: -65536 });
  await waitFor(() => expect(button.querySelector('.color-dot')).toHaveStyle({ background: 'rgb(255, 0, 0)' }));
  expect((await notesRepo.get('category-note'))?.color.value).toBe(-1);
});

it.each([false, true])('initializes a new note with the stored category (filter: %s)', async filtered => {
  await db.delete(); await db.open();
  const { DEFAULT_CATEGORY_ID } = await import('../domain/color');
  const storedDefault = { ...defaultColor, id: DEFAULT_CATEGORY_ID, value: -65536, theme: 'My default' };
  const filteredColor = { ...defaultColor, id: 'work', value: -16776961, theme: 'Work' };
  await db.colors.bulkPut([storedDefault, filteredColor]);
  const expected = filtered ? filteredColor : storedDefault;
  render(<MemoryRouter initialEntries={[filtered ? '/note/new?color=work' : '/note/new']}><NoteEditorScreen id="new" /></MemoryRouter>);
  const title = await screen.findByLabelText('editor.title_placeholder');
  expect(screen.getByRole('button', { name: `colors.title: ${expected.theme}` })).toBeInTheDocument();
  expect(await notesRepo.all()).toHaveLength(0);
  expect(screen.queryByText('editor.draft')).not.toBeInTheDocument();
  fireEvent.change(title, { target: { value: 'New category note' } });
  fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
  await waitFor(async () => expect(await notesRepo.all()).toHaveLength(1));
  expect((await notesRepo.all())[0].color).toEqual(expected);
});

it('creates a real default category when the database is empty and the requested category is missing', async () => {
  await db.delete(); await db.open();
  const { DEFAULT_CATEGORY_ID, DEFAULT_CATEGORY_COLOR } = await import('../domain/color');
  render(<MemoryRouter initialEntries={['/note/new?color=deleted']}><NoteEditorScreen id="new" /></MemoryRouter>);
  const title = await screen.findByLabelText('editor.title_placeholder');
  const stored = await db.colors.get(DEFAULT_CATEGORY_ID);
  expect(stored).toMatchObject({ id: DEFAULT_CATEGORY_ID, value: DEFAULT_CATEGORY_COLOR });
  fireEvent.change(title, { target: { value: 'New' } });
  fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
  await waitFor(async () => expect(await notesRepo.all()).toHaveLength(1));
  expect((await notesRepo.all())[0].color).toEqual(stored);
});

it('opens an Android rich note and closes it without creating an unsaved draft', async () => {
  await db.delete(); await db.open();
  const note = makeNote('rich-clean', {
    checkings: 'h', content: '<strong>&#1055;&#1088;&#1080;&#1074;&#1077;&#1090;</strong><ul><li>one</li></ul><br><ul><li>two</li></ul>',
  });
  await notesRepo.put(note);
  render(<MemoryRouter><NoteEditorScreen id="rich-clean" /></MemoryRouter>);
  await screen.findByRole('toolbar');
  expect(screen.queryByText('editor.draft')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await notesRepo.get(note.id)).toEqual(note);
});

it('still marks actual rich formatting edits as unsaved', async () => {
  await db.delete(); await db.open();
  await notesRepo.put(makeNote('rich-edit', { checkings: 'h', content: '<b>Hello</b>' }));
  render(<MemoryRouter><NoteEditorScreen id="rich-edit" /></MemoryRouter>);
  await screen.findByRole('toolbar');
  const editor = (document.querySelector('.tiptap') as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
  act(() => { editor.commands.setTextSelection({ from: 1, to: 6 }); editor.commands.toggleItalic(); });
  expect(await screen.findByText('editor.draft')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

it('keeps date changes in the draft until Save and synchronizes the saved event', async () => {
  vi.clearAllMocks();
  await db.delete(); await db.open();
  const note = makeNote('with-date');
  await notesRepo.put(note);
  render(<MemoryRouter><NoteEditorScreen id="with-date" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'events.add' }));
  fireEvent.change(screen.getByLabelText('events.date'), { target: { value: '2026-11-06' } });
  fireEvent.click(screen.getByLabelText('events.with_time'));
  fireEvent.change(screen.getByLabelText('events.time'), { target: { value: '10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'settings.save' }));
  expect(await notesRepo.get(note.id)).toEqual(note);
  expect(screen.getByText('editor.draft')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
  await waitFor(async () => expect((await notesRepo.get(note.id))?.events).toEqual([
    expect.objectContaining({ noteId: note.id, when: new Date(2026, 10, 6, 10).getTime(), type: 0, repeat: 0 }),
  ]));
  const { scheduleNoteSync } = await import('../sync/editSync');
  expect(scheduleNoteSync).toHaveBeenCalledWith(note.id, expect.anything());
});

it('allows a new date-only note to be saved', async () => {
  await db.delete(); await db.open();
  render(<MemoryRouter><NoteEditorScreen id="new" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'events.add' }));
  fireEvent.change(screen.getByLabelText('events.date'), { target: { value: '2026-11-08' } });
  fireEvent.click(screen.getByRole('button', { name: 'settings.save' }));
  fireEvent.click(screen.getByRole('button', { name: 'notes.save' }));
  await waitFor(async () => expect(await notesRepo.all()).toHaveLength(1));
  expect((await notesRepo.all())[0].events[0]).toMatchObject({ type: 2, when: new Date(2026, 10, 8).getTime() });
});


it('downloads the current draft without saving it', async () => {
  const files = await import('../export/files');
  const download = vi.spyOn(files, 'downloadFile').mockImplementation(() => {});
  try {
    await db.delete(); await db.open();
    await notesRepo.put(makeNote('export-draft'));
    render(<MemoryRouter><NoteEditorScreen id="export-draft" /></MemoryRouter>);
    fireEvent.change(await screen.findByDisplayValue('Hello world'), { target: { value: 'Ещё одна строка' } });
    fireEvent.click(screen.getByLabelText('common.actions'));
    fireEvent.click(screen.getByRole('button', { name: 'export.title' }));
    fireEvent.change(screen.getByLabelText('export.format'), { target: { value: 'txt' } });
    fireEvent.click(screen.getByRole('button', { name: 'attachments.download' }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const [blob, title, format] = download.mock.calls[0];
    expect(await blob.text()).toContain('Ещё одна строка');
    expect([title, format]).toEqual(['Test Note', 'txt']);
    expect((await notesRepo.get('export-draft'))?.content).toBe('Hello world');
  } finally { download.mockRestore(); }
});
