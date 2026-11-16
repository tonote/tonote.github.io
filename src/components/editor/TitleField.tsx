import { useTranslation } from 'react-i18next';
import { SearchField } from './SearchField';

export function TitleField({ value, onChange, query, readOnly }: { value: string; onChange: (value: string) => void; query?: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  return <SearchField readOnly={readOnly} className="title-field" value={value} onChange={onChange} query={query} label={t('editor.title_placeholder')} placeholder={t('editor.title_placeholder')} multiline autoGrow />;
}
