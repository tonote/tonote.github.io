import { useTranslation } from 'react-i18next';
import { SearchField } from './SearchField';

export function PlainBody({ value, onChange, query, readOnly }: { value: string; onChange: (value: string) => void; query?: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  return <SearchField readOnly={readOnly} className="plain-body" value={value} onChange={onChange} query={query} label={t('notes.create_text')} placeholder={t('editor.content_placeholder')} multiline />;
}
