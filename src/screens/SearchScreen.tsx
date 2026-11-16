import { NOTE_STATE } from '../domain/types';
import { settingsStore } from '../state/settingsStore';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDecryptedNotes } from '../db/useDecrypted';
import { searchNotes } from '../domain/search';
import { cryptoStore } from '../state/cryptoStore';
import { NoteGrid } from '../components/NoteGrid';

export function SearchScreen() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const layout = settingsStore((s) => s.layout);
  const q = searchParams.get('q') ?? '';
  const unlocked = cryptoStore((s) => s.unlocked);
  const key = cryptoStore((s) => s.key);

  const { notes, loading } = useDecryptedNotes({ state: NOTE_STATE.NONE });

  const results = useMemo(() => {
    const unlockedKey = unlocked ? key : null;
    return searchNotes(notes, q, { unlockedKey });
  }, [notes, q, unlocked, key]);

  if (loading) {
    return <div className="note-list-empty">{t('auth.loading')}</div>;
  }

  const trimmed = q.trim();

  return (
    <div className="note-list">
      {trimmed && (
        <div className={`search-header ${layout === 'list' ? 'note-content-list' : ''}`}>
          {t('search.results_count', { count: results.length, query: trimmed })}
        </div>
      )}

      {!trimmed && (
        <div className="note-list-empty">{t('search.empty_query')}</div>
      )}

      {trimmed && results.length === 0 && (
        <div className="note-list-empty">{t('search.no_results')}</div>
      )}

      {results.length > 0 && (
        <NoteGrid notes={results} layout={layout} query={q} />
      )}
    </div>
  );
}
