import { SyncPasswordDialog } from './SyncPasswordDialog';
import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../state/authStore';
import { settingsStore } from '../state/settingsStore';
import { initSyncTriggers } from '../state/syncTriggers';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { AppContent } from './AppContent';
import { useReadOnly } from '../state/accessStore';

export function AppShell() {
  const location = useLocation();
  const currentPath = useRef(location.pathname);
  currentPath.current = location.pathname;
  const status = useAuthStore((s) => s.status);
  const settingsInit = settingsStore((s) => s.init);
  const theme = settingsStore((s) => s.theme);
  const readOnly = useReadOnly();

  useEffect(() => {
    if (status === 'signed-in') {
      settingsInit();
      return initSyncTriggers(() => !currentPath.current.startsWith('/note/'));
    }
  }, [status, settingsInit]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app-layout">
      <TopBar />
      {!readOnly && <SyncPasswordDialog />}
      <div className="app-body">
        <Sidebar />
        <AppContent>
          <Outlet />
        </AppContent>
      </div>
    </div>
  );
}
