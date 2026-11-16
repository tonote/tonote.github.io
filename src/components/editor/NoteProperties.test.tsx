import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NoteProperties } from './NoteProperties';
import { createNoteDraft } from '../../domain/noteDraft';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../db/useColors', () => ({ useColors: () => ({ colors: [
  { id: 'work', value: -1, theme: 'Work' }, { id: 'empty', value: 0, theme: '' },
] }) }));
it('shows named color choices and immediately reflects pin and category changes', () => {
  function Editor() {
    const [note, setNote] = useState(createNoteDraft('plain'));
    return <NoteProperties note={note} disabled={false} onColorChange={color => setNote({ ...note, color })} onPinToggle={() => setNote({ ...note, pinned: !note.pinned })} onEncryptToggle={() => setNote({ ...note, iv: note.iv ? undefined : 'iv' })} />;
  }
  render(<Editor />);
  const pin = screen.getByRole('button', { name: 'notes.pin' });
  const outline = pin.querySelector('path')?.getAttribute('d');
  expect(pin).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(pin);
  const unpin = screen.getByRole('button', { name: 'notes.unpin' });
  expect(unpin).toHaveAttribute('aria-pressed', 'true');
  expect(unpin.querySelector('path')?.getAttribute('d')).not.toBe(outline);
  fireEvent.click(unpin);
  expect(screen.getByRole('button', { name: 'notes.pin' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'notes.encrypt' }));
  expect(screen.getByRole('button', { name: 'notes.decrypt' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'notes.decrypt' }));
  expect(screen.getByRole('button', { name: 'notes.encrypt' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'colors.title: ###' }));
  fireEvent.click(screen.getByRole('button', { name: 'Work' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'colors.title: Work' })).toBeInTheDocument();
});
