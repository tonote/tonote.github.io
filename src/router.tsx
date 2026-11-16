import { useEffect } from 'react';
import { Routes, Route, useLocation, useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from './state/authStore';
import { AuthScreen } from './screens/AuthScreen';
import { AppShell } from './components/AppShell';
import { NoteListScreen } from './screens/NoteListScreen';
import { NoteEditorScreen } from './screens/NoteEditorScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ColorsScreen } from './screens/ColorsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SecuredScreen } from './screens/SecuredScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { NOTE_STATE } from './domain/types';

function FolderListScreen() {
  const location = useLocation();
  // Extract folder id from the path
  const folderId = location.pathname.replace('/folder/', '');
  return <NoteListScreen folderId={folderId} />;
}

function ColorNotesScreen() {
  const { id } = useParams();
  return <NoteListScreen colorId={id} />;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'signed-in') {
    return <>{children}</>;
  }
  return <AuthScreen />;
}

export function AppRoutes() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { void init(); }, [init]);
  return (
    <Routes>
      <Route
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      >
        <Route index element={<NoteListScreen />} />
        <Route path="folder/:id" element={<FolderListScreen />} />
        <Route path="note/:id" element={<NoteEditorScreen />} />
        <Route
          path="archive"
          element={<NoteListScreen noteState={NOTE_STATE.ARCHIVED} />}
        />
        <Route
          path="trash"
          element={<NoteListScreen noteState={NOTE_STATE.REMOVED} />}
        />
        <Route path="search" element={<SearchScreen />} />
        <Route path="secured" element={<SecuredScreen />} />
        <Route path="calendar" element={<CalendarScreen />} />
        <Route path="color/:id" element={<ColorNotesScreen />} />
        <Route path="colors" element={<ColorsScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
