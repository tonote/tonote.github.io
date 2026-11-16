import { useColors } from '../db/useColors';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Note } from '../domain/types';
import { NoteCard } from './NoteCard';

function Masonry({ notes, layout, query }: { notes: Note[]; layout: 'grid' | 'list'; query?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || layout === 'list' || typeof ResizeObserver === 'undefined') return;
    const cards = Array.from(grid.children) as HTMLElement[];
    const arrange = () => {
      const styles = getComputedStyle(grid);
      const columns = styles.gridTemplateColumns.split(' ').length;
      const gap = parseFloat(styles.columnGap);
      const width = (grid.clientWidth - gap * (columns - 1)) / columns;
      if (width <= 0) return;
      const heights = Array<number>(columns).fill(0);
      for (const card of cards) {
        const column = heights.indexOf(Math.min(...heights));
        card.style.position = 'absolute';
        card.style.width = `${width}px`;
        card.style.left = `${column * (width + gap)}px`;
        card.style.top = `${heights[column]}px`;
        heights[column] += card.getBoundingClientRect().height + gap;
      }
      grid.style.height = `${Math.max(0, ...heights) - (cards.length ? gap : 0)}px`;
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(grid);
    cards.forEach(card => observer.observe(card));
    return () => {
      observer.disconnect();
      grid.style.height = '';
      cards.forEach(card => {
        card.style.position = '';
        card.style.width = '';
        card.style.left = '';
        card.style.top = '';
      });
    };
  }, [notes, layout]);

  return <div ref={ref} className={`note-grid ${layout === 'list' ? 'note-rows' : ''}`}>
    {notes.map(note => <NoteCard key={note.id} note={note} query={query} />)}
  </div>;
}

export function NoteGrid({ notes, layout, query }: { notes: Note[]; layout: 'grid' | 'list'; query?: string }) {
  const { t } = useTranslation();
  const { colors, loading } = useColors();
  const resolvedNotes = useMemo(() => {
    const byId = new Map(colors.map(color => [color.id, color]));
    return notes.map(note => {
      const color = byId.get(note.color.id);
      return color ? { ...note, color } : note;
    });
  }, [notes, colors]);
  if (loading) return <div className="note-list-empty">{t('auth.loading')}</div>;
  const pinned = resolvedNotes.filter(note => note.pinned);
  const others = resolvedNotes.filter(note => !note.pinned);
  return <div className={`note-groups ${layout === 'list' ? 'note-groups-list' : ''}`}>
    {pinned.length > 0 && <section>
      <h2 className="note-group-title">{t('notes.pinned')}</h2>
      <Masonry notes={pinned} layout={layout} query={query} />
    </section>}
    {others.length > 0 && <section>
      {pinned.length > 0 && <h2 className="note-group-title">{t('notes.others')}</h2>}
      <Masonry notes={others} layout={layout} query={query} />
    </section>}
  </div>;
}
