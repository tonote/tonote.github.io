import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Event } from '../../domain/types';
import { dateKey, eventFromInput, eventTimestamp, formatEvent } from '../../domain/events';
import { Modal } from '../Modal';
import { Icon } from '../Icon';

export function NoteEvents({ noteId, events, readOnly, onChange }: {
  noteId: string; events: Event[]; readOnly: boolean; onChange: (events: Event[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<Event | 'new' | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [withTime, setWithTime] = useState(false);
  const [repeat, setRepeat] = useState(0);
  const [weekdays, setWeekdays] = useState(0);
  const [error, setError] = useState(false);
  const open = (event?: Event) => {
    const stamp = event ? eventTimestamp(event) : null;
    const value = stamp === null ? new Date() : new Date(stamp);
    setEditing(event ?? 'new'); setDate(dateKey(value));
    setTime(`${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`);
    setWithTime(!!event && event.type !== 2);
    const savedRepeat = event?.repeat ?? 0;
    setRepeat(savedRepeat > 4 ? 5 : savedRepeat); setWeekdays(savedRepeat > 4 ? savedRepeat : 0); setError(false);
  };
  const save = () => {
    if (!editing || readOnly) return;
    const original = editing === 'new' ? undefined : editing;
    const event = eventFromInput(noteId, date, withTime ? time : '', withTime ? (repeat === 5 ? weekdays : repeat) : 0, original);
    if (!event || (withTime && !time) || (withTime && repeat === 5 && !weekdays)) { setError(true); return; }
    onChange(original ? events.map(item => item.id === original.id ? event : item) : [...events, event]);
    setEditing(null);
  };
  if (readOnly && !events.length) return null;
  return <section className="note-events">
    <div className="note-events-heading"><h2>{t('events.title')}</h2>
      {!readOnly && <button className="btn" type="button" onClick={() => open()}><Icon name="add" />{t('events.add')}</button>}
    </div>
    <ul className="note-event-list">{[...events].sort((a, b) => (eventTimestamp(a) ?? Infinity) - (eventTimestamp(b) ?? Infinity)).map(event =>
      <li key={event.id}><Icon name="calendar" /><span>{formatEvent(event, i18n?.resolvedLanguage) || t('events.invalid')}{!!event.repeat && <small> · {t(`events.repeat_${event.repeat <= 4 ? event.repeat : 'custom'}`)}</small>}</span>
        {!readOnly && <>
          <button type="button" className="icon-btn" aria-label={t('events.edit')} onClick={() => open(event)}><Icon name="edit" /></button>
          <button type="button" className="icon-btn" aria-label={t('events.remove')} onClick={() => onChange(events.filter(item => item.id !== event.id))}><Icon name="close" /></button>
        </>}
      </li>
    )}</ul>
    {editing && <Modal label={t(editing === 'new' ? 'events.add' : 'events.edit')} onClose={() => setEditing(null)}>
      <form className="event-form" onSubmit={event => { event.preventDefault(); save(); }}>
        <h2>{t(editing === 'new' ? 'events.add' : 'events.edit')}</h2>
        <label>{t('events.date')}<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="event-time-toggle"><input type="checkbox" checked={withTime} onChange={event => setWithTime(event.target.checked)} />{t('events.with_time')}</label>
        {withTime && <label>{t('events.time')}<input type="time" required value={time} onChange={event => setTime(event.target.value)} /></label>}
        {withTime && <label>{t('events.repeat')}<select value={repeat} onChange={event => setRepeat(Number(event.target.value))}>
          {[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{t(`events.repeat_${value}`)}</option>)}
          <option value={5}>{t('events.repeat_custom')}</option>
        </select></label>}
        {withTime && repeat === 5 && <div className="event-weekdays" role="group" aria-label={t('events.repeat_custom')}>{[1, 2, 3, 4, 5, 6, 0].map(day => {
          const bit = 8 << day;
          const date = new Date(2024, 0, 7 + day);
          return <button key={day} type="button" aria-label={date.toLocaleDateString(i18n?.resolvedLanguage, { weekday: 'long' })} aria-pressed={!!(weekdays & bit)} onClick={() => setWeekdays(weekdays ^ bit)}>{date.toLocaleDateString(i18n?.resolvedLanguage, { weekday: 'short' })}</button>;
        })}</div>}
        {error && <p className="error-msg" role="alert">{t('events.invalid')}</p>}
        <div className="modal-actions"><button type="button" className="btn" onClick={() => setEditing(null)}>{t('settings.cancel')}</button><button type="submit" className="btn btn-primary">{t('settings.save')}</button></div>
      </form>
    </Modal>}
  </section>;
}
