import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Note, Color } from '../domain/types';

const defaultColor: Color = {
  id: 'c1', edited: 0, value: 0xFFFFD700, theme: 'Yellow', showAsFilter: true, priority: 1,
};

const makeNote = (id: string, overrides?: Partial<Note>): Note => ({
  id,
  edited: Date.now(),
  created: Date.now(),
  title: `Note ${id}`,
  content: 'Some content here',
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



vi.mock('../state/cryptoStore', () => {
  const state = { unlocked: false };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { cryptoStore: store };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { NoteCard } from '../components/NoteCard';

describe('NoteCard', () => {
  it('renders title and preview for a plain note', () => {
    const note = makeNote('n1', { title: 'Test Note', content: 'Hello world', checkings: '' });

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(NoteCard, { note }),
      ),
    );

    expect(screen.getByText('Test Note')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders a color stripe', () => {
    const note = makeNote('n1');

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(NoteCard, { note }),
      ),
    );

    const stripe = document.querySelector('.color-stripe');
    expect(stripe).toBeInTheDocument();
    expect(stripe?.getAttribute('style')).toContain('rgb(255, 215, 0)');
  });

  it('renders a locked message for encrypted notes', () => {
    const note = makeNote('n1', { iv: 'abc', title: 'Encrypted', content: '', checkings: '' });

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(NoteCard, { note }),
      ),
    );

    expect(screen.getByText('notes.locked')).toBeInTheDocument();
  });

  it('shows pin icon for pinned notes', () => {
    const note = makeNote('n1', { pinned: true });

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(NoteCard, { note }),
      ),
    );

    expect(screen.getByLabelText('notes.pin')).toBeInTheDocument();
  });

  it('renders checklist summary for list notes', () => {
    const note = makeNote('n1', {
      checkings: '10',
      content: 'Item 1\nItem 2',
    });

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(NoteCard, { note }),
      ),
    );

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders folder icon for folder notes', () => {
    const note = makeNote('n1', { checkings: 'f', content: '', title: 'My Folder' });

    render(
      React.createElement(MemoryRouter, {},
        React.createElement(NoteCard, { note }),
      ),
    );

    expect(screen.getByText('My Folder')).toBeInTheDocument();
  });
});

// Opening a folder must navigate into its contents, including from the keyboard.
it('opens folder contents with Enter', () => {
  render(<MemoryRouter><Routes>
    <Route path="/" element={<NoteCard note={makeNote('folder-1', { checkings: 'f', title: 'Folder' })} />} />
    <Route path="/folder/:id" element={<p>Folder contents</p>} />
  </Routes></MemoryRouter>);
  fireEvent.keyDown(screen.getByRole('button', { name: /Folder/ }), { key: 'Enter' });
  expect(screen.getByText('Folder contents')).toBeInTheDocument();
});

it('shows relative modification dates, category and folder status without an edit button', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { rerender } = render(<MemoryRouter><NoteCard note={makeNote('folder', { checkings: 'f', edited: yesterday.getTime() })} /></MemoryRouter>);
  expect(screen.getByText('notes.yesterday')).toBeInTheDocument();
  expect(screen.getByText('Yellow')).toBeInTheDocument();
  expect(screen.getByLabelText('notes.create_folder').closest('.card-footer')).not.toBeNull();
  expect(screen.queryByLabelText('common.edit_folder')).not.toBeInTheDocument();
  rerender(<MemoryRouter><NoteCard note={makeNote('today', { color: { ...defaultColor, theme: '' } })} /></MemoryRouter>);
  expect(screen.getByText('notes.today')).toBeInTheDocument();
  expect(screen.getByText('###')).toBeInTheDocument();
});

it('shows decoded rich content and highlights a word across formatting tags', () => {
  render(<MemoryRouter><NoteCard query="привет" note={makeNote('rich', {
    checkings: 'h', content: '<b>&#1055;&#1088;&#1080;</b><i>&#x432;&#x435;&#x442;</i> &amp; мир',
  })} /></MemoryRouter>);
  expect(document.querySelector('.card-preview')?.textContent).toBe('Привет & мир');
  expect(document.querySelector('.card-preview mark')?.textContent).toBe('Привет');
});

it('renders one explicit blank line between bullet groups without HTML formatting whitespace', () => {
  render(<MemoryRouter><NoteCard note={makeNote('bullets', {
    checkings: 'h', content: '<ul>\n<li>one</li>\n<li>two</li>\n</ul><br><ul><li>three</li></ul>',
  })} /></MemoryRouter>);
  const preview = document.querySelector('.card-preview > div')!;
  expect(preview.innerHTML).toBe('<ul><li>one</li><li>two</li></ul><br><ul><li>three</li></ul>');
});

it('preserves intentional inline line breaks and spaces in rich previews', () => {
  render(<MemoryRouter><NoteCard note={makeNote('rich', {
    checkings: 'h', content: '<b>one</b> <i>two</i><br>three',
  })} /></MemoryRouter>);
  const preview = document.querySelector('.card-preview > div')!;
  expect(preview.textContent).toContain('one two');
  expect(preview.querySelectorAll('br')).toHaveLength(1);
});

it('displays added date/time independently of the modification date', () => {
  render(<MemoryRouter><NoteCard note={makeNote('dated', { events: [
    { id: 'date', when: new Date(2026, 10, 6, 10).getTime(), type: 0, repeat: 3 },
    { id: 'unknown' },
  ] })} /></MemoryRouter>);
  const dates = screen.getByRole('list', { name: 'events.title' });
  expect(dates.querySelectorAll('li')).toHaveLength(1);
  expect(dates.querySelector('time')).toHaveAttribute('datetime', new Date(2026, 10, 6, 10).toISOString());
  expect(screen.getByLabelText('events.repeats')).toBeInTheDocument();
});
