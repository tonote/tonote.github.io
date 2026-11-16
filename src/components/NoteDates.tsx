import { useTranslation } from 'react-i18next';
import type { Event } from '../domain/types';
import { eventTimestamp, formatEvent } from '../domain/events';
import { Icon } from './Icon';

export function NoteDates({ events }: { events: Event[] }) {
  const { t, i18n } = useTranslation();
  const valid = events.filter(event => eventTimestamp(event) !== null).sort((a, b) => a.when! - b.when!);
  if (!valid.length) return null;
  return <ul className="note-dates" aria-label={t('events.title')}>
    {valid.map(event => <li key={event.id}>
      <Icon name="calendar" />
      <time dateTime={new Date(event.when!).toISOString()}>{formatEvent(event, i18n?.resolvedLanguage)}</time>
      {!!event.repeat && <span title={t('events.repeats')} aria-label={t('events.repeats')}><Icon name="repeat" /></span>}
    </li>)}
  </ul>;
}
