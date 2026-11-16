import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { createNoteDraft } from '../domain/noteDraft';
import { CalendarScreen } from './CalendarScreen';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en-US' } }) }));
vi.mock('../db/useDecrypted', () => ({ useDecryptedNotes: () => ({ notes: [
  { ...createNoteDraft('plain'), id: 'first', title: 'First event', events: [{ id: 'e1', when: new Date(2026, 10, 6, 10).getTime(), type: 0 }] },
  { ...createNoteDraft('plain'), id: 'second', title: 'Second event', events: [{ id: 'e2', when: new Date(2026, 10, 8).getTime(), type: 2 }] },
], loading: false }) }));
vi.mock('../db/useColors', () => ({ useColors: () => ({ colors: [], loading: false }) }));

it('shows full cards for a month, filters by day, and switches months', () => {
  render(<MemoryRouter initialEntries={['/calendar?month=2026-11']}><CalendarScreen /></MemoryRouter>);
  expect(screen.getByText('First event')).toBeInTheDocument();
  expect(screen.getByText('Second event')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /November 6, 2026/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /November 6, 2026/ }));
  expect(screen.getByText('First event')).toBeInTheDocument();
  expect(screen.queryByText('Second event')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'calendar.all_month' }));
  expect(screen.getByText('Second event')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'calendar.next' }));
  expect(screen.getByRole('heading', { name: 'December 2026' })).toBeInTheDocument();
  expect(screen.getByText('calendar.empty_month')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'calendar.previous' }));
  expect(screen.getByText('First event')).toBeInTheDocument();
});
