import type { Event, Note } from './types';

export function eventTimestamp(event: Event): number | null {
  return typeof event.when === 'number' && Number.isFinite(new Date(event.when).getTime()) ? event.when : null;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatEvent(event: Event, locale?: string): string {
  const timestamp = eventTimestamp(event);
  if (timestamp === null) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(event.type === 2 ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(timestamp);
}

/** Local date inputs must not pass through UTC (new Date('YYYY-MM-DD')). */
export function eventFromInput(noteId: string, date: string, time: string, repeat: number, original?: Event): Event | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (time && !/^\d{2}:\d{2}$/.test(time))) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time ? time.split(':').map(Number) : [0, 0];
  const when = new Date(year, month - 1, day, hour, minute);
  if (dateKey(when) !== date || when.getHours() !== hour || when.getMinutes() !== minute) return null;
  return {
    ...original, id: original?.id ?? crypto.randomUUID(), noteId, edited: Date.now(), when: when.getTime(),
    type: time ? (original?.type === 1 ? 1 : 0) : 2, repeat,
  };
}

/** Expand Android repeats in a bounded visible interval, in the local timezone. */
export function eventOccurrences(event: Event, from: Date, to: Date): number[] {
  const stamp = eventTimestamp(event);
  if (stamp === null || stamp >= to.getTime()) return [];
  const seed = new Date(stamp);
  const repeat = event.repeat ?? 0;
  if (!repeat) return stamp >= from.getTime() ? [stamp] : [];
  const result: number[] = [];
  if (repeat === 3 || repeat === 4) {
    const cursor = new Date(seed);
    // Calendar.add clamps month ends and retains the clamped day on later repeats.
    while (cursor < to) {
      if (cursor >= from) result.push(cursor.getTime());
      const day = cursor.getDate();
      cursor.setDate(1);
      cursor.setMonth(cursor.getMonth() + (repeat === 3 ? 1 : 12));
      cursor.setDate(Math.min(day, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()));
    }
    return result;
  }
  const cursor = new Date(Math.max(from.getTime(), stamp));
  cursor.setHours(seed.getHours(), seed.getMinutes(), seed.getSeconds(), seed.getMilliseconds());
  while (cursor < to) {
    const matches = repeat === 1 || (repeat === 2 ? cursor.getDay() === seed.getDay()
      : dateKey(cursor) === dateKey(seed) || (repeat & (8 << cursor.getDay())) !== 0);
    if (matches && cursor >= from && cursor >= seed) result.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export interface CalendarEntry { note: Note; event: Event; when: number; }
export function calendarEntries(notes: Note[], from: Date, to: Date): CalendarEntry[] {
  return notes.filter(note => note.state === 0).flatMap(note => note.events.flatMap(event =>
    eventOccurrences(event, from, to).map(when => ({ note, event, when }))
  )).sort((a, b) => a.when - b.when || a.note.id.localeCompare(b.note.id));
}
