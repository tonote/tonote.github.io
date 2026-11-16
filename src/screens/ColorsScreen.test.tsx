import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../db/database';
import { colorsRepo } from '../db/colorsRepo';
import type { Color } from '../domain/types';

vi.mock('../state/navStore', () => {
  const state = { currentFolderId: null, sidebarOpen: false };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { navStore: store };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { ColorsScreen } from './ColorsScreen';

const makeColor = (id: string, overrides?: Partial<Color>): Color => ({
  id,
  edited: Date.now(),
  value: 0xFFFF0000,
  theme: 'Red',
  showAsFilter: true,
  priority: 0,
  ...overrides,
});

describe('ColorsScreen', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('renders list from seeded db', async () => {
    await colorsRepo.put(makeColor('c1', { theme: 'Red' }));
    await colorsRepo.put(makeColor('c2', { theme: 'Blue', value: 0xFF0000FF }));

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(ColorsScreen),
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Red')).toBeInTheDocument();
      expect(screen.getByText('Blue')).toBeInTheDocument();
    });
  });

  it('add creates a color', async () => {
    render(
      React.createElement(MemoryRouter, {},
        React.createElement(ColorsScreen),
      ),
    );

    // Wait for the component to finish loading (no colors, so no loading state)
    await waitFor(() => {
      expect(screen.queryByText('auth.loading')).not.toBeInTheDocument();
    });

    const addButton = screen.getByText('colors.add');
    fireEvent.click(addButton);

    await waitFor(async () => {
      const all = await colorsRepo.all();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBeDefined();
    });
  });

  it('edit name persists', async () => {
    await colorsRepo.put(makeColor('c1', { theme: 'Red' }));

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(ColorsScreen),
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Red')).toBeInTheDocument();
    });

    // Click the name span to enter edit mode
    const nameSpan = screen.getByText('Red');
    fireEvent.click(nameSpan);

    // Now there should be an input with value "Red"
    const nameInput = screen.getByDisplayValue('Red') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Crimson' } });
    // Blur triggers save
    fireEvent.blur(nameInput);

    await waitFor(async () => {
      const c = await colorsRepo.get('c1');
      expect(c?.theme).toBe('Crimson');
    });
  });

  it('delete removes a color', async () => {
    await colorsRepo.put(makeColor('c1', { theme: 'Red' }));
    await colorsRepo.put(makeColor('c2', { theme: 'Blue' }));

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(ColorsScreen),
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Red')).toBeInTheDocument();
      expect(screen.getByText('Blue')).toBeInTheDocument();
    });

    // Find the delete button for c1 (the first row)
    const row = screen.getByText('Red').closest('.color-row') as HTMLElement;
    fireEvent.click(within(row).getByLabelText('colors.delete'));

    await waitFor(async () => {
      const all = await colorsRepo.all();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('c2');
    });
  });
});

it('orders categories by descending priority and exposes one color input per row', async () => {
  await db.delete(); await db.open();
  await colorsRepo.bulkPut([makeColor('low', { theme: 'Low', priority: 1 }), makeColor('high', { theme: 'High', priority: 20 })]);
  render(<MemoryRouter><ColorsScreen /></MemoryRouter>);
  await screen.findByText('High');
  const rows = document.querySelectorAll('.color-row');
  expect(rows[0]).toHaveTextContent('High');
  expect(rows[1]).toHaveTextContent('Low');
  expect(rows[0].querySelectorAll('input[type="color"]')).toHaveLength(1);
  expect(rows[0].querySelector('.color-swatch')).toBeNull();
});

it.each([0, 1, 2, 3])('does not delete a category referenced by notes in state %s', async (state) => {
  await db.delete(); await db.open();
  const color = makeColor('used'); await colorsRepo.put(color);
  const { createNoteDraft } = await import('../domain/noteDraft');
  await db.notes.put({ ...createNoteDraft('plain'), color, title: 'Keep', state: state as 0 | 1 | 2 | 3 });
  render(<MemoryRouter><ColorsScreen /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('colors.delete'));
  expect(await screen.findByRole('dialog')).toHaveTextContent('colors.used_warning');
  expect(await colorsRepo.get(color.id)).toBeDefined();
});
