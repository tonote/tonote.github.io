import { Icon, type IconName } from './Icon';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useColors } from '../db/useColors';
import { useNotes } from '../db/useNotes';
import { NOTE_STATE } from '../domain/types';
import { categoryColorToCss } from '../domain/color';
import { navStore } from '../state/navStore';

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { colors } = useColors();
  const { notes } = useNotes({ state: NOTE_STATE.NONE });
  const counts = new Map<string, number>();
  for (const note of notes) counts.set(note.color.id, (counts.get(note.color.id) ?? 0) + 1);
  const sidebarOpen = navStore((s) => s.sidebarOpen);
  const setSidebarOpen = navStore((s) => s.setSidebarOpen);

  const closeMobile = () => setSidebarOpen(false);

  const navItem = (href: string, label: string, icon: IconName) => {
    const active = location.pathname === href;
    return (
      <li key={href}>
        <a
          href={`#${href}`}
          className={active ? 'active' : ''}
          aria-current={active ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(href);
            closeMobile();
          }}
        >
          <Icon name={icon} />{label}
        </a>
      </li>
    );
  };

  return (
    <>
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={closeMobile}
      />
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <ul className="sidebar-nav">
          {navItem('/', t('nav.all_notes'), 'notes')}
          {navItem('/secured', t('nav.secured'), 'lock')}
          {navItem('/colors', t('colors.title'), 'palette')}
          {navItem('/calendar', t('calendar.title'), 'calendar')}
          <li className="sidebar-divider" role="separator" />
          {navItem('/archive', t('nav.archive'), 'archive')}
          {navItem('/trash', t('nav.trash'), 'trash')}
          <li className="sidebar-divider" role="separator" />

          {colors.length > 0 && (
            <>
              {colors
                .filter((c) => c.showAsFilter)
                .sort((a, b) => b.priority - a.priority)
                .map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#/color/${c.id}`}
                      className={location.pathname === `/color/${c.id}` ? 'active' : ''}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/color/${c.id}`);
                        closeMobile();
                      }}
                    >
                      <span
                        className="color-dot"
                        style={{ background: categoryColorToCss(c.value) }}
                      />
                      <span className="sidebar-category-name">{c.theme.trim() || '###'}</span>
                      <span className="sidebar-category-count">{counts.get(c.id) ?? 0}</span>
                    </a>
                  </li>
                ))}
            </>
          )}

        </ul>
        <ul className="sidebar-nav sidebar-bottom">{navItem('/settings', t('nav.settings'), 'settings')}</ul>
      </nav>
    </>
  );
}
