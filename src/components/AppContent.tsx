import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Remember each list's scroll independently, including search and calendar filters. */
export function AppContent({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isNote = location.pathname.startsWith('/note/');
  const route = location.pathname + (isNote ? '' : location.search);
  const positions = useRef(new Map<string, number>());
  const container = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = container.current!;
    const body = content.current!;
    const target = isNote ? 0 : positions.current.get(route) ?? 0;
    let restoring = true;
    let frame = 0;
    let resize: ResizeObserver | undefined;
    let mutation: MutationObserver | undefined;
    const stop = () => {
      restoring = false;
      resize?.disconnect();
      mutation?.disconnect();
      cancelAnimationFrame(frame);
    };
    const restore = () => {
      if (!restoring) return;
      root.scrollTop = target;
      // IndexedDB, decryption and masonry layout can finish after navigation.
      // Keep the saved offset until the list is tall enough to restore it.
      if (root.scrollHeight - root.clientHeight >= target) stop();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    };
    const remember = () => {
      if (!restoring && !isNote) positions.current.set(route, root.scrollTop);
    };
    const interact = () => { stop(); remember(); };
    if (typeof ResizeObserver !== 'undefined') {
      resize = new ResizeObserver(schedule);
      resize.observe(body);
    }
    mutation = new MutationObserver(schedule);
    mutation.observe(body, { childList: true, subtree: true, attributes: true });
    root.scrollTop = 0;
    schedule();
    root.addEventListener('scroll', remember);
    root.addEventListener('wheel', interact, { passive: true });
    root.addEventListener('touchstart', interact, { passive: true });
    root.addEventListener('pointerdown', interact);
    root.addEventListener('keydown', interact);
    return () => {
      stop();
      root.removeEventListener('scroll', remember);
      root.removeEventListener('wheel', interact);
      root.removeEventListener('touchstart', interact);
      root.removeEventListener('pointerdown', interact);
      root.removeEventListener('keydown', interact);
    };
  }, [route, isNote]);

  return <main className="app-content" ref={container}><div ref={content}>{children}</div></main>;
}
