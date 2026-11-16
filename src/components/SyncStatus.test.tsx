import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SyncStatus } from './SyncStatus';
import { syncStore } from '../state/syncStore';
import { syncNow } from '../state/syncTriggers';
import { accessStore } from '../state/accessStore';
import { useAuthStore } from '../state/authStore';
vi.mock('../state/syncTriggers', () => ({ syncNow: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, args?: { count?: number }) => `${key}${args?.count !== undefined ? ` ${args.count}` : ''}` }) }));
beforeEach(() => {
  vi.clearAllMocks(); syncStore.setState({ status: 'idle', pending: 0, progress: null, lastError: null });
  useAuthStore.setState({ needsAuthorization: false, authorizing: false, authError: false });
});
it('shows an error as the primary status even with a non-empty outbox and retries on click', () => {
  syncStore.setState({ status: 'error', pending: 176, lastError: 'Upload failed' });
  render(<SyncStatus />);
  const status = screen.getByRole('button', { name: 'sync.refresh' });
  expect(status).toHaveTextContent('sync.error'); expect(status).toHaveTextContent('sync.pending 176');
  expect(status).toHaveAttribute('title', 'Upload failed');
  fireEvent.click(status); expect(syncNow).toHaveBeenCalledOnce();
});
it('labels the backup mode as read-only and still allows refresh to detect Android migration', () => {
  accessStore.setState({ mode: 'readonly' }); syncStore.setState({ pending: 176 });
  render(<SyncStatus />);
  const status = screen.getByRole('button', { name: 'sync.refresh' });
  expect(status).toHaveTextContent('sync.readonly'); expect(status).not.toHaveTextContent('sync.pending');
  fireEvent.click(status); expect(syncNow).toHaveBeenCalledOnce();
});
it('shows a passive readonly indicator while viewing one note', () => {
  accessStore.setState({ mode: 'readonly' });
  render(<SyncStatus refreshable={false} />);
  expect(screen.getByText('sync.readonly')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'sync.refresh' })).toBeNull();
  fireEvent.click(screen.getByText('sync.readonly')); expect(syncNow).not.toHaveBeenCalled();
});
it('offers renewal instead of a raw sync error and refreshes the list only after success', async () => {
  const signIn = vi.fn().mockResolvedValue(true);
  useAuthStore.setState({ needsAuthorization: true, signIn });
  syncStore.setState({ status: 'error', lastError: 'Not authenticated' });
  render(<SyncStatus />);
  const button = screen.getByRole('button', { name: 'auth.continue' });
  expect(button).toHaveAttribute('title', 'auth.expired'); expect(screen.queryByText('Not authenticated')).toBeNull();
  fireEvent.click(button);
  await waitFor(() => expect(syncNow).toHaveBeenCalledOnce()); expect(signIn).toHaveBeenCalledOnce();
});
it('permits renewal from a note without refreshing the catalog or checking Android migration', async () => {
  const signIn = vi.fn().mockResolvedValue(true);
  accessStore.setState({ mode: 'readonly' }); useAuthStore.setState({ needsAuthorization: true, signIn });
  render(<SyncStatus refreshable={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'auth.continue' }));
  await waitFor(() => expect(signIn).toHaveBeenCalledOnce());
  expect(syncNow).not.toHaveBeenCalled(); expect(accessStore.getState().mode).toBe('readonly');
});
it('does not refresh after a cancelled popup and disables clicks while authorizing', async () => {
  const signIn = vi.fn().mockResolvedValue(false);
  useAuthStore.setState({ needsAuthorization: true, signIn });
  const { rerender } = render(<SyncStatus />);
  fireEvent.click(screen.getByRole('button', { name: 'auth.continue' }));
  await waitFor(() => expect(signIn).toHaveBeenCalledOnce()); expect(syncNow).not.toHaveBeenCalled();
  useAuthStore.setState({ authorizing: true }); rerender(<SyncStatus />);
  expect(screen.getByRole('button', { name: 'auth.continue' })).toBeDisabled();
});
