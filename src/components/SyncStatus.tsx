import { useTranslation } from 'react-i18next';
import { syncNow } from '../state/syncTriggers';
import { syncStore } from '../state/syncStore';
import { accessStore } from '../state/accessStore';
import { useAuthStore } from '../state/authStore';

export function SyncStatus({ refreshable = true }: { refreshable?: boolean }) {
  const { t } = useTranslation();
  const status = syncStore((s) => s.status);
  const pending = syncStore((s) => s.pending);
  const lastError = syncStore((s) => s.lastError);
  const progress = syncStore((s) => s.progress);
  const readOnly = accessStore(s => s.mode === 'readonly');
  const needsAuthorization = useAuthStore(s => s.needsAuthorization);
  const authorizing = useAuthStore(s => s.authorizing);
  const authError = useAuthStore(s => s.authError);
  const signIn = useAuthStore(s => s.signIn);

  if (needsAuthorization || authorizing) return <button type="button" className="sync-status sync-refresh"
    disabled={authorizing} aria-label={t('auth.continue')} title={t(authError ? 'auth.failed' : 'auth.expired')}
    onClick={() => { void signIn().then(ok => { if (ok && refreshable) void syncNow(); }); }}>
    {authorizing ? <div className="spinner" /> : <span aria-hidden="true">☁</span>}
    <span>{t(authorizing ? 'auth.loading' : 'auth.continue')}</span>
  </button>;

  const content = <>
      {status === 'syncing' && <div className="spinner" />}
      {status === 'error' && <div className="error-dot" />}
      {status !== 'syncing' && status !== 'error' && (
        <span aria-hidden="true">☁</span>
      )}
      <span>
        {readOnly ? t('sync.readonly') : status === 'syncing' && progress
          ? t(`sync.progress_${progress.phase}`, { completed: progress.completed, total: progress.total })
          : status === 'error' || status === 'crypto-conflict'
          ? `${t(`sync.${status}`)}${pending > 0 ? ` · ${t('sync.pending', { count: pending })}` : ''}`
          : pending > 0
          ? t('sync.pending', { count: pending })
          : t(`sync.${status}`)}
      </span>
      {status === 'error' && lastError && <span className="sync-error-detail" role="status">{lastError}</span>}
  </>;
  const title = status === 'error' && lastError ? lastError : readOnly ? t('sync.readonly_description') : t(`sync.${status}`);
  return refreshable
    ? <button type="button" className="sync-status sync-refresh" onClick={() => void syncNow()} aria-label={t('sync.refresh')} title={title}>{content}</button>
    : <span className="sync-status" title={title}>{content}</span>;
}
