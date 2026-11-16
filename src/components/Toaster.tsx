import { create } from 'zustand';

type ToastLevel = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  level: ToastLevel;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (message: string, level: ToastLevel) => void;
  remove: (id: number) => void;
}

let nextId = 0;
const AUTO_DISMISS_MS = 3000;

export const toastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, level) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, level }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS);
  },
  remove: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Imperative toast API — call from anywhere. */
export const toast = {
  success: (msg: string) => toastStore.getState().add(msg, 'success'),
  error: (msg: string) => toastStore.getState().add(msg, 'error'),
  info: (msg: string) => toastStore.getState().add(msg, 'info'),
};

/**
 * Toast renderer component. Mount once in the app root.
 */
export function Toaster() {
  const toasts = toastStore((s) => s.toasts);
  const remove = toastStore((s) => s.remove);

  return (
    <div className="toaster-container" style={{
      position: 'fixed',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.level}`}
          role="alert"
          style={{
            padding: '10px 20px',
            borderRadius: '6px',
            background: t.level === 'error'
              ? 'var(--danger, #d32f2f)'
              : t.level === 'success'
                ? 'var(--success, #388e3c)'
                : 'var(--surface, #333)',
            color: '#fff',
            fontSize: '0.875rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            pointerEvents: 'auto',
            cursor: 'pointer',
            maxWidth: '90vw',
            wordBreak: 'break-word',
          }}
          onClick={() => remove(t.id)}
        >
          {t.level === 'error' && '✕ '}
          {t.level === 'success' && '✓ '}
          {t.message}
        </div>
      ))}
    </div>
  );
}
