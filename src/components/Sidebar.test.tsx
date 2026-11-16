import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/database';
import { createNoteDraft } from '../domain/noteDraft';
import { Sidebar } from './Sidebar';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it('counts active category notes including folder contents and updates the badge', async () => {
  await db.delete();
  await db.open();
  const color = { id: 'test-color', theme: 'Work', value: 0xff00ff00, showAsFilter: true, priority: 1, edited: 1 };
  await db.colors.put(color);
  const note = createNoteDraft('plain');
  await db.notes.bulkPut([
    { ...note, id: 'root', color, state: 0 },
    { ...note, id: 'nested', color, state: 0, parentId: 'folder' },
    { ...note, id: 'archived', color, state: 1 },
  ]);
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  const link = await screen.findByRole('link', { name: /Work/ });
  await waitFor(() => expect(within(link).getByText('2')).toBeInTheDocument());
  await db.notes.update('nested', { state: 2 });
  await waitFor(() => expect(within(link).getByText('1')).toBeInTheDocument());
  expect(link).toHaveAttribute('href', '#/color/test-color');
});
