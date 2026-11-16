import { describe, expect, it } from 'vitest';
import { calendarEntries, dateKey, eventFromInput, eventOccurrences, formatEvent } from './events';
import { createNoteDraft } from './noteDraft';

const stamp = (year: number, month: number, day: number, hour = 10) => new Date(year, month - 1, day, hour).getTime();

describe('note dates', () => {
  it('creates Android date-only and date/time events without reminders', () => {
    const date = eventFromInput('note', '2026-11-06', '', 0)!;
    expect(date).toMatchObject({ noteId: 'note', type: 2, repeat: 0 });
    expect(dateKey(new Date(date.when!))).toBe('2026-11-06');
    expect(new Date(date.when!).getHours()).toBe(0);
    const time = eventFromInput('note', '2026-11-06', '10:30', 3)!;
    expect(time).toMatchObject({ type: 0, repeat: 3 });
    expect(new Date(time.when!).getHours()).toBe(10);
    expect(new Date(time.when!).getMinutes()).toBe(30);
    expect(formatEvent(date, 'en-GB')).not.toContain(':');
    expect(formatEvent(time, 'en-GB')).toContain('10:30');
  });
  it('rejects invalid dates and times and preserves imported metadata on edits', () => {
    expect(eventFromInput('note', '2026-02-31', '', 0)).toBeNull();
    expect(eventFromInput('note', '2026-11-06', '25:00', 0)).toBeNull();
    const original = { id: 'old', when: stamp(2026, 11, 6), type: 1, repeat: 40, custom: 'keep' };
    const edited = eventFromInput('note', '2026-11-07', '12:00', 40, original)!;
    expect(edited).toMatchObject({ id: 'old', type: 1, repeat: 40, custom: 'keep' });
    expect(original.when).toBe(stamp(2026, 11, 6));
  });
  it('expands repeats only from the initial date and within the visible interval', () => {
    const from = new Date(2026, 10, 1); const to = new Date(2026, 11, 1);
    const event = { id: 'e', when: stamp(2026, 11, 6), type: 0 };
    expect(eventOccurrences(event, from, to)).toHaveLength(1);
    expect(eventOccurrences({ ...event, repeat: 1 }, from, to)).toHaveLength(25);
    expect(eventOccurrences({ ...event, repeat: 2 }, from, to).map(value => new Date(value).getDate())).toEqual([6, 13, 20, 27]);
    // Android weekday mask: Monday=16, Friday=256.
    expect(eventOccurrences({ ...event, repeat: 272 }, from, to).map(value => new Date(value).getDate())).toEqual([6, 9, 13, 16, 20, 23, 27, 30]);
  });
  it('matches Android month-end clamping and leap-year repeats', () => {
    const from = new Date(2026, 2, 1); const to = new Date(2026, 3, 1);
    expect(eventOccurrences({ id: 'm', when: stamp(2026, 1, 31), repeat: 3 }, from, to)).toEqual([stamp(2026, 3, 28)]);
    expect(eventOccurrences({ id: 'y', when: stamp(2024, 2, 29), repeat: 4 }, new Date(2028, 1, 1), new Date(2028, 2, 1))).toEqual([stamp(2028, 2, 28)]);
  });
  it('includes nested notes but excludes archive, trash, missing and invalid dates', () => {
    const active = { ...createNoteDraft('plain', 'folder'), events: [{ id: 'event', when: stamp(2026, 11, 6) }, { id: 'unknown' }, { id: 'bad', when: NaN }] };
    const notes = [active, { ...active, id: 'archived', state: 1 as const }, { ...active, id: 'trash', state: 2 as const }];
    expect(calendarEntries(notes, new Date(2026, 10, 1), new Date(2026, 11, 1))).toEqual([{ note: active, event: active.events[0], when: stamp(2026, 11, 6) }]);
  });
});
