import { track } from '../analytics';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { settingsStore } from '../state/settingsStore';
import { SyncStatus } from './SyncStatus';
import { navStore } from '../state/navStore';
import { Icon } from './Icon';

export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const inNote = location.pathname.startsWith('/note/');
  const query = new URLSearchParams(location.search).get('q') ?? '';
  const theme = settingsStore((s) => s.theme);
  const setTheme = settingsStore((s) => s.setTheme);
  const sidebarOpen = navStore((s) => s.sidebarOpen);
  const setSidebarOpen = navStore((s) => s.setSidebarOpen);

  const search = (value: string) => {
    const params = new URLSearchParams(inNote ? location.search : '');
    if (value) params.set('q', value); else params.delete('q');
    navigate({ pathname: inNote ? location.pathname : '/search', search: params.toString() }, {
      replace: inNote || location.pathname === '/search', state: location.state,
    });
  };

  return (
    <header className="top-bar" role="banner">
      <button className="icon-btn hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} type="button" aria-label={t('nav.menu')} aria-expanded={sidebarOpen}>
        <Icon name="menu" />
      </button>
      <span className="logo">{t('app.title')}</span>
      <form className="search-form" role="search" onSubmit={(e) => { e.preventDefault(); search(query); }}>
        <Icon name="search" />
        <input className="search-input" type="search" placeholder={t(inNote ? 'search.in_note' : 'nav.search_placeholder')} aria-label={t(inNote ? 'search.in_note' : 'nav.search_placeholder')} value={query} onChange={(e) => search(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { search(''); e.currentTarget.blur(); } }} />
        {inNote && <span id="note-search-controls" />}
        {query && <button className="icon-btn" type="button" aria-label={t('common.clear')} onClick={() => search('')}><Icon name="close" /></button>}
      </form>
      <span className="spacer" />
      <SyncStatus refreshable={!inNote} />
      <a onClick={() => track('support_click', { source: 'toolbar' })} className="icon-btn" href="/donate.html" target="_blank" rel="noopener noreferrer" aria-label={t('settings.donate')} title={t('settings.donate')}>
        <Icon name="heart" />
      </a>
      <button className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} type="button" aria-label={t('settings.theme')} title={t('settings.theme')}>
        <Icon name={theme === 'light' ? 'moon' : 'sun'} />
      </button>
    </header>
  );
}
