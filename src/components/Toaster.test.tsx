import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { Toaster, toast, toastStore } from './Toaster';

// Use fake timers for auto-dismiss test, real timers for the rest
vi.useFakeTimers({ shouldAdvanceTime: true });

// ---- ErrorBoundary tests ----

describe('ErrorBoundary', () => {
  const origError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = origError;
  });

  it('renders children when no error', () => {
    render(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement('div', null, 'Hello'),
      ),
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('catches render errors and shows fallback', () => {
    function Thrower() {
      throw new Error('boom');
    }

    render(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(Thrower),
      ),
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });
});

// ---- Toaster tests ----

describe('Toaster', () => {
  beforeEach(() => {
    // Clear all toasts between tests
    const { toasts } = toastStore.getState();
    toasts.forEach((t) => toastStore.getState().remove(t.id));
  });

  it('shows a toast message', async () => {
    render(React.createElement(Toaster));

    act(() => {
      toast.success('Operation successful');
    });

    // Toast prepends "✓ " for success level
    await waitFor(() => {
      expect(screen.getByText(/Operation successful/)).toBeInTheDocument();
    });
  });

  it('dismisses toast on click', async () => {
    render(React.createElement(Toaster));

    act(() => {
      toast.info('Click to dismiss');
    });

    await waitFor(() => {
      expect(screen.getByText(/Click to dismiss/)).toBeInTheDocument();
    });

    act(() => {
      screen.getByText(/Click to dismiss/).click();
    });

    expect(screen.queryByText(/Click to dismiss/)).not.toBeInTheDocument();
  });

  it('shows multiple toasts', async () => {
    render(React.createElement(Toaster));

    act(() => {
      toast.success('First');
      toast.error('Second');
    });

    await waitFor(() => {
      expect(screen.getByText(/First/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Second/)).toBeInTheDocument();
    });
  });

  it('auto-dismisses toast after timeout', async () => {
    render(React.createElement(Toaster));

    act(() => {
      toast.info('Will auto-dismiss');
    });

    await waitFor(() => {
      expect(screen.getByText(/Will auto-dismiss/)).toBeInTheDocument();
    });

    // Advance time past the auto-dismiss timeout (3s)
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText(/Will auto-dismiss/)).not.toBeInTheDocument();
  });
});
