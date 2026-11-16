import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('../state/cryptoStore', () => {
  const mockUnlock = vi.fn();
  const state = {
    unlocked: false,
    key: null,
    unlock: mockUnlock,
    lock: vi.fn(),
  };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state, {
    getState: () => state,
  });
  return { cryptoStore: store };
});

vi.mock('../state/syncStore', () => {
  const state = { cryptoConflict: undefined };
  const store = Object.assign((sel: (s: typeof state) => unknown) => sel(state), state);
  return { syncStore: store };
});

vi.mock('../state/syncTriggers', () => ({
  syncNow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { UnlockDialog } from './UnlockDialog';
import { cryptoStore } from '../state/cryptoStore';

describe('UnlockDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(
      React.createElement(UnlockDialog, {
        open: true,
        onClose: vi.fn(),
      }),
    );

    expect(screen.getByText('unlock.title')).toBeInTheDocument();
    expect(screen.getByLabelText('unlock.password')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      React.createElement(UnlockDialog, {
        open: false,
        onClose: vi.fn(),
      }),
    );

    expect(screen.queryByText('unlock.title')).not.toBeInTheDocument();
  });

  it('shows error on wrong password', async () => {
    const mockUnlock = cryptoStore((s: any) => s.unlock) as ReturnType<typeof vi.fn>;
    mockUnlock.mockResolvedValue(false);
    mockUnlock.mockClear();

    const onClose = vi.fn();

    render(
      React.createElement(UnlockDialog, {
        open: true,
        onClose,
      }),
    );

    const input = screen.getByLabelText('unlock.password');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('unlock.submit'));

    await waitFor(() => {
      expect(screen.getByText('unlock.wrong_password')).toBeInTheDocument();
    });

    // Should NOT call onClose on failure
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on correct password', async () => {
    const mockUnlock = cryptoStore((s: any) => s.unlock) as ReturnType<typeof vi.fn>;
    mockUnlock.mockResolvedValue(true);
    mockUnlock.mockClear();

    const onClose = vi.fn();

    render(
      React.createElement(UnlockDialog, {
        open: true,
        onClose,
      }),
    );

    const input = screen.getByLabelText('unlock.password');
    fireEvent.change(input, { target: { value: 'correct' } });
    fireEvent.click(screen.getByText('unlock.submit'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

it('shows, clears and discards the password when dismissed with Escape', () => {
  const onClose = vi.fn();
  const { rerender } = render(<UnlockDialog open onClose={onClose} />);
  const password = screen.getByLabelText('unlock.password');
  fireEvent.change(password, { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.show_password' }));
  expect(password).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'common.clear' }));
  expect(password).toHaveValue('');
  expect(password).toHaveFocus();
  fireEvent.change(password, { target: { value: 'another secret' } });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  rerender(<UnlockDialog open={false} onClose={onClose} />);
  rerender(<UnlockDialog open onClose={onClose} />);
  expect(screen.getByLabelText('unlock.password')).toHaveValue('');
  expect(screen.getByLabelText('unlock.password')).toHaveAttribute('type', 'password');
});
