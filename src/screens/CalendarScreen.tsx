import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDecryptedNotes } from '../db/useDecrypted';
import { useColors } from '../db/useColors';
import { settingsStore } from '../state/settingsStore';
import { calendarEntries, dateKey, type CalendarEntry } from '../domain/events';
import { categoryColorToCss } from '../domain/color';
import { NoteGrid } from '../components/NoteGrid';
import { Icon } from '../components/Icon';
import type { Note } from '../domain/types';

function notesForDay(entries: CalendarEntry[]): Note[] {
  const notes = new Map<string, Note>();
  for (const { note, event, when } of entries) {
    if (!notes.has(note.id)) notes.set(note.id, { ...note, events: [] });
    notes.get(note.id)!.events.push({ ...event, when });
  }
  return [...notes.values()];
}

export function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage;
  const [params, setParams] = useSearchParams();
  const today = new Date();
  const monthParam = params.get('month') ?? '';
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam);
  const year = validMonth ? Number(monthParam.slice(0, 4)) : today.getFullYear();
  const month = validMonth ? Number(monthParam.slice(5)) - 1 : today.getMonth();
  const selected = params.get('day') ?? '';
  const first = new Date(year, month, 1);
  const next = new Date(year, month + 1, 1);
  const gridStart = new Date(year, month, 1 - (first.getDay() + 6) % 7);
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 42);
  const { notes, loading } = useDecryptedNotes({ state: 0 });
  const { colors } = useColors();
  const layout = settingsStore(state => state.layout);
  const rangeStart = gridStart.getTime();
  const rangeEnd = gridEnd.getTime();
  const entries = useMemo(() => calendarEntries(notes, new Date(rangeStart), new Date(rangeEnd)), [notes, rangeStart, rangeEnd]);
  const grouped = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const key = dateKey(new Date(entry.when));
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const shown = [...grouped].filter(([key]) => selected ? key === selected : key >= dateKey(first) && key < dateKey(next));
  const changeMonth = (offset: number) => setParams({ month: dateKey(new Date(year, month + offset, 1)).slice(0, 7) });
  return <div className="note-list calendar-screen">
    <section className="calendar-panel" aria-label={t('calendar.title')}>
      <div className="calendar-header">
        <div className="calendar-month-nav">
          <div className="calendar-arrows">
            <button type="button" className="icon-btn" aria-label={t('calendar.previous')} onClick={() => changeMonth(-1)}><Icon name="back" /></button>
            <button type="button" className="icon-btn calendar-next" aria-label={t('calendar.next')} onClick={() => changeMonth(1)}><Icon name="back" /></button>
          </div>
        </div>
        <h1 aria-live="polite">{first.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h1>
        <div className="calendar-controls">
          <button type="button" className="btn" onClick={() => setParams({ month: dateKey(today).slice(0, 7), day: dateKey(today) })}>{t('notes.today')}</button>
          <button type="button" className={`btn ${!selected ? 'btn-primary' : ''}`} aria-pressed={!selected} onClick={() => setParams({ month: dateKey(first).slice(0, 7) })}>{t('calendar.all_month')}</button>
        </div>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{days.slice(0, 7).map(day => <span key={day.getDay()}>{day.toLocaleDateString(locale, { weekday: 'short' })}</span>)}</div>
      <div className="calendar-days">{days.map(day => {
        const key = dateKey(day);
        const dayEntries = grouped.get(key) ?? [];
        return <button type="button" key={key} className={`calendar-day ${day.getMonth() !== month ? 'outside' : ''} ${selected === key ? 'selected' : ''}`}
          aria-label={`${day.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}, ${t('calendar.count', { count: dayEntries.length })}`}
          aria-pressed={selected === key} aria-current={key === dateKey(today) ? 'date' : undefined}
          onClick={() => setParams({ month: dateKey(day).slice(0, 7), day: key })}>
          <span className="calendar-day-number">{day.getDate()}</span>
          <span className="calendar-dots" aria-hidden="true">{dayEntries.slice(0, 3).map(({ note, event }, index) => <i key={`${note.id}-${event.id}-${index}`} style={{ background: categoryColorToCss((colors.find(color => color.id === note.color.id) ?? note.color).value) }} />)}{dayEntries.length > 3 && <small>+{dayEntries.length - 3}</small>}</span>
        </button>;
      })}</div>
    </section>
    <div className={`calendar-agenda ${layout === 'list' ? 'note-content-list' : ''}`} aria-live="polite">
      {loading ? <p className="note-list-empty">{t('auth.loading')}</p> : shown.length ? shown.map(([key, dayEntries]) => <section key={key}>
        <h2 className="calendar-agenda-date">{new Date(dayEntries[0].when).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <NoteGrid notes={notesForDay(dayEntries)} layout={layout} />
      </section>) : <p className="note-list-empty">{t(selected ? 'calendar.empty_day' : 'calendar.empty_month')}</p>}
    </div>
  </div>;
}
