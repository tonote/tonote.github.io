import { it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { NoteCard } from './NoteCard';
import { TopBar } from './TopBar';
import { createNoteDraft } from '../domain/noteDraft';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./SyncStatus', () => ({ SyncStatus: () => null }));
function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

it('retains the result query and searches the open note without leaving it', () => {
  const note = { ...createNoteDraft('plain'), id: 'found', title: 'Find hello here' };
  render(<MemoryRouter initialEntries={['/search?q=hello']}>
    <Routes>
      <Route path="/search" element={<NoteCard note={note} query="hello" />} />
      <Route path="/note/:id" element={<><TopBar /><Location /></>} />
    </Routes>
  </MemoryRouter>);
  expect(document.querySelector('mark')).toHaveTextContent('hello');
  fireEvent.click(screen.getByRole('button'));
  const input = screen.getByRole('searchbox');
  expect(input).toHaveValue('hello');
  fireEvent.change(input, { target: { value: 'new query' } });
  expect(screen.getByTestId('location')).toHaveTextContent('/note/found?q=new+query');
  fireEvent.click(screen.getByRole('button', { name: 'common.clear' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/note/found');
  expect(input).toHaveValue('');
});
