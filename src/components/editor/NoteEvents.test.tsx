import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NoteEvents } from './NoteEvents';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en-US' } }) }));

it('edits Android weekday masks and saves selected days', () => {
  const onChange = vi.fn();
  const event = { id: 'event', when: new Date(2026, 10, 6, 10).getTime(), type: 0, repeat: 272 };
  render(<NoteEvents noteId="note" events={[event]} readOnly={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'events.edit' }));
  expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
  fireEvent.click(screen.getByRole('button', { name: 'settings.save' }));
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'event', repeat: 264 })]);
});


it('only allows repeats with a time and clears them when time is removed', () => {
  const onChange = vi.fn();
  const event = { id: 'event', when: new Date(2026, 10, 6, 10).getTime(), type: 0, repeat: 1 };
  render(<NoteEvents noteId="note" events={[event]} readOnly={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'events.edit' }));
  expect(screen.getByLabelText('events.repeat')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'events.with_time' }));
  expect(screen.queryByLabelText('events.repeat')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'settings.save' }));
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ type: 2, repeat: 0 })]);
});
