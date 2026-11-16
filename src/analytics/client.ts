import { measurementId } from './config';

type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

let scriptReady: Promise<void> | undefined;
function loadScript(): Promise<void> {
  if (!scriptReady) {
    scriptReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      script.onload = () => resolve();
      script.onerror = () => { script.remove(); reject(new Error('Analytics script unavailable')); };
      document.head.appendChild(script);
    }).catch(error => { scriptReady = undefined; throw error; });
  }
  return scriptReady;
}

export async function createClient(allowed: () => boolean) {
  if (!allowed()) return null;
  await loadScript();
  if (!allowed()) return null;
  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  const gtag: Gtag = target.gtag ?? function () { target.dataLayer!.push(arguments); };
  target.gtag = gtag;
  const defaults = { page_location: `${location.origin}/`, page_referrer: '', page_title: 'ToNote' };
  gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('js', new Date());
  gtag('config', measurementId, { ...defaults, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  return {
    enable(enabled: boolean) {
      gtag('consent', 'update', { analytics_storage: enabled ? 'granted' : 'denied' });
    },
    send(name: string, params: Record<string, string | number | boolean>) {
      gtag('event', name, { ...params, ...defaults, send_to: measurementId, ...(import.meta.env.VITE_ANALYTICS_DEBUG === 'true' ? { debug_mode: true } : {}) });
    },
  };
}
