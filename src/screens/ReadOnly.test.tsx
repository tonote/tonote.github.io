import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/database';
import { accessStore } from '../state/accessStore';
import { DEFAULT_CATEGORY } from '../domain/color';
import { FakeDrive, note } from '../sync/testing';
import { beginSession } from '../sync/session';
import { fullSync } from '../sync/engine';
import { NoteEditorScreen } from './NoteEditorScreen';
import { ColorsScreen } from './ColorsScreen';
import { SettingsScreen } from './SettingsScreen';
import { CreateFAB } from '../components/CreateFAB';
vi.mock('../sync/editSync', () => ({ scheduleNoteSync: vi.fn(), cancelNoteSync: vi.fn(), cancelAllNoteSync: vi.fn(), reportSyncError: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }) }));
beforeEach(async () => {
  beginSession(); await db.delete(); await db.open(); accessStore.setState({ mode: 'readonly' });
  await db.backupColors.put(DEFAULT_CATEGORY);
});
it('displays the snapshot with immutable text, checklist, category, reminders and attachments', async () => {
  const source = note('n', { title: 'Backup title', content: 'First\nSecond', checkings: '01',
    events: [{ id: 'event', type: 0, when: 1730000000000 }], attachments: [{ id: 'file', name: 'photo.jpg' }] });
  await db.backupNotes.put(source);
  await db.notes.put(note('n', { title: 'Unrelated editable cache' }));
  render(<MemoryRouter><NoteEditorScreen id="n" /></MemoryRouter>);
  expect(await screen.findByDisplayValue('Backup title')).toHaveAttribute('readonly');
  expect(screen.queryByDisplayValue('Unrelated editable cache')).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'First' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Second' })).toBeDisabled();
  expect(screen.getByDisplayValue('First')).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'photo.jpg' })).toBeEnabled();
  for (const name of ['notes.save', 'common.actions', 'notes.restore', 'notes.delete', 'notes.delete_forever', 'events.add', 'events.edit', 'events.remove', 'attachments.add', 'attachments.remove']) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
  const user = userEvent.setup(); await user.click(screen.getByRole('checkbox', { name: 'First' }));
  await user.type(screen.getByDisplayValue('Backup title'), 'edit');
  expect(await db.backupNotes.get('n')).toEqual(source); expect(await db.outbox.count()).toBe(0);
});
it.each([1, 2, 3] as const)('does not expose restore or deletion for snapshot state %s', async state => {
  await db.backupNotes.put(note('n', { title: 'Readonly', state }));
  render(<MemoryRouter><NoteEditorScreen id="n" /></MemoryRouter>);
  await screen.findByDisplayValue('Readonly');
  for (const name of ['notes.restore', 'notes.delete', 'notes.delete_forever']) expect(screen.queryByRole('button', { name })).toBeNull();
});
it('does not allow note creation even through a direct new-note URL', async () => {
  render(<MemoryRouter><CreateFAB /><NoteEditorScreen id="new" /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: 'notes.new_note' })).toBeNull();
  expect(await screen.findByText('sync.readonly_description')).toBeVisible();
  expect(await db.notes.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
});
it('keeps category navigation but disables all category changes', async () => {
  await db.backupColors.put({ ...DEFAULT_CATEGORY, id: 'work', theme: 'Work' });
  render(<MemoryRouter><ColorsScreen /></MemoryRouter>);
  expect(await screen.findByText('Work')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'colors.add' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'colors.delete' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Work' })).toBeNull();
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled();
  for (const color of screen.getAllByLabelText('colors.color_value')) expect(color).toBeDisabled();
  expect(screen.getAllByRole('link', { name: 'colors.open' })).toHaveLength(2);
});
it('allows local display settings while hiding password changes', async () => {
  render(<MemoryRouter><SettingsScreen /></MemoryRouter>);
  expect(screen.getByLabelText('settings.layout')).toBeEnabled();
  expect(screen.getByLabelText('settings.sort_order')).toBeEnabled();
  expect(screen.queryByText('settings.encryption')).toBeNull();
  expect(screen.queryByRole('button', { name: 'settings.set_password' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'settings.change_password' })).toBeNull();
});
it('changes an open note from the backup view to the Android sync version before enabling edits', async () => {
  await db.backupNotes.put(note('n', { content: 'Snapshot body' }));
  render(<MemoryRouter><NoteEditorScreen id="n" /></MemoryRouter>);
  expect(await screen.findByDisplayValue('Snapshot body')).toHaveAttribute('readonly');
  const drive = new FakeDrive(); drive.seed(note('n', { content: 'Android body' }));
  await act(async () => { await fullSync(drive); });
  await waitFor(() => expect(screen.getByDisplayValue('Android body')).not.toHaveAttribute('readonly'));
  expect(screen.queryByDisplayValue('Snapshot body')).toBeNull(); expect(screen.getByRole('button', { name: 'notes.save' })).toBeEnabled();
  await userEvent.setup().type(screen.getByDisplayValue('Android body'), ' web edit');
  await userEvent.setup().click(screen.getByRole('button', { name: 'notes.save' }));
  await waitFor(async () => expect((await db.notes.get('n'))?.content).toBe('Android body web edit'));
});
