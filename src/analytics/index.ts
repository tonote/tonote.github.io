import { create } from 'zustand';
import { measurementId } from './config';

const storageKey = 'tonote.analytics.enabled';
function readConsent() {
  try { return window.localStorage.getItem(storageKey) !== 'false'; } catch { return true; }
}
export const analyticsStore = create<{ enabled: boolean }>(() => ({ enabled: readConsent() }));
type Client = NonNullable<Awaited<ReturnType<typeof import('./client').createClient>>>;
let client: Client | null = null;
let pending: Promise<Client | null> | undefined;
let generation = 0;
const allowed = () => analyticsStore.getState().enabled && (
  import.meta.env.VITE_ANALYTICS_DEBUG === 'true' ||
  (import.meta.env.PROD && location.hostname === 'tonote.github.io')
);

export function setAnalyticsEnabled(enabled: boolean) {
  generation++;
  try { window.localStorage.setItem(storageKey, String(enabled)); } catch { /* Session-only preference. */ }
  analyticsStore.setState({ enabled });
  const collect = allowed();
  (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = !collect;
  try { client?.enable(collect); } catch { /* Preference still applies if the SDK fails. */ }
}

export type Screen = 'notes' | 'editor' | 'folder' | 'category' | 'archive' | 'trash' | 'search' | 'secured' | 'calendar' | 'colors' | 'settings' | 'auth' | 'unknown';
interface Events {
  show_fragment: { tag: Screen };
  page_view: { screen_name: Screen };
  save_note: { type: number; is_new: boolean; crypto: boolean; events: number; images: number };
  notes_action: { action: 'archive' | 'trash' | 'restore' | 'purge'; notes: number };
  theme_change: { theme: 'light' | 'dark' };
  support_click: { source: 'toolbar' | 'settings' };
}

export function track<K extends keyof Events>(name: K, params: Events[K]) {
  if (!allowed()) return;
  const revision = generation;
  // Analytics must never delay or reject a user operation.
  void (async () => {
    if (!client) {
      pending ??= import('./client').then(module => module.createClient(allowed)).finally(() => { pending = undefined; });
      client = await pending;
      if (client && !allowed()) client.enable(false);
    }
    if (client && allowed() && generation === revision) {
      client.enable(true);
      client.send(name, params);
    }
  })().catch(() => { /* Unsupported browsers, blockers and offline operation are normal. */ });
}

export function screenName(pathname: string): Screen {
  if (pathname === '/') return 'notes';
  if (/^\/note\/[^/]+$/.test(pathname)) return 'editor';
  if (/^\/folder\/[^/]+$/.test(pathname)) return 'folder';
  if (/^\/color\/[^/]+$/.test(pathname)) return 'category';
  const name = pathname.slice(1);
  switch (name) {
    case 'archive': case 'trash': case 'search': case 'secured':
    case 'calendar': case 'colors': case 'settings': return name;
    default: return 'unknown';
  }
}

export function refreshAnalyticsConsent() {
  setAnalyticsEnabled(readConsent());
}
