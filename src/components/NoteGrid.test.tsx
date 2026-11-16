import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Note, Color } from '../domain/types';
import { NoteGrid } from './NoteGrid';

const categories = vi.hoisted(() => ({ colors: [] as Color[], loading: false }));
vi.mock('../db/useColors', () => ({ useColors: () => categories }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./NoteCard', () => ({ NoteCard: ({ note }: { note: Note }) => <div data-testid={note.id} data-color={note.color.value}>{note.title}</div> }));
const notes = [100, 200, 60, 150, 90].map((height, index) => ({ id: String(index), title: String(height), pinned: false, color: { id: 'category', value: -1 } } as Note));
afterEach(() => { categories.colors = []; categories.loading = false; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('fills the first four columns left to right, then uses the shortest column', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const getStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(el => el.classList.contains('note-grid')
    ? { gridTemplateColumns: '270px 270px 270px 270px', columnGap: '12px' } as CSSStyleDeclaration
    : getStyle(el));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1116);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { height: Number(this.textContent) } as DOMRect;
  });
  const { rerender } = render(<NoteGrid notes={notes} layout="grid" />);
  for (let i = 0; i < 4; i++) {
    expect(screen.getByTestId(String(i))).toHaveStyle({ left: `${i * 282}px`, top: '0px' });
  }
  expect(screen.getByTestId('4')).toHaveStyle({ left: '564px', top: '72px' });
  rerender(<NoteGrid notes={notes} layout="list" />);
  expect(screen.getByTestId('4').style.position).toBe('');
});

it('separates pinned notes while preserving order inside each group', () => {
  const { container } = render(<NoteGrid notes={notes.map((n, i) => ({ ...n, pinned: i === 1 || i === 3 }))} layout="list" />);
  const sections = container.querySelectorAll('section');
  expect(sections).toHaveLength(2);
  expect(Array.from(sections[0].querySelectorAll('[data-testid]'), el => el.getAttribute('data-testid'))).toEqual(['1', '3']);
  expect(Array.from(sections[1].querySelectorAll('[data-testid]'), el => el.getAttribute('data-testid'))).toEqual(['0', '2', '4']);
});

it('waits for categories before showing cards, including when reopening the list', () => {
  categories.loading = true;
  const { rerender, unmount } = render(<NoteGrid notes={notes} layout="grid" />);
  expect(screen.queryByTestId('0')).not.toBeInTheDocument();
  categories.colors = [{ id: 'category', value: -394759 } as Color];
  categories.loading = false;
  rerender(<NoteGrid notes={notes} layout="grid" />);
  expect(screen.getByTestId('0')).toHaveAttribute('data-color', '-394759');
  unmount();
  categories.loading = true;
  categories.colors = [];
  const reopened = render(<NoteGrid notes={notes} layout="grid" />);
  expect(screen.queryByTestId('0')).not.toBeInTheDocument();
  categories.loading = false;
  categories.colors = [{ id: 'category', value: -65536 } as Color];
  reopened.rerender(<NoteGrid notes={notes} layout="grid" />);
  expect(screen.getByTestId('0')).toHaveAttribute('data-color', '-65536');
});

it('falls back to the saved color only after confirming the category is absent', () => {
  render(<NoteGrid notes={notes} layout="grid" />);
  expect(screen.getByTestId('0')).toHaveAttribute('data-color', '-1');
});
