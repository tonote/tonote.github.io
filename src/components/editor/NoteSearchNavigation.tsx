import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';

export function NoteSearchNavigation({ root, query }: { root: RefObject<HTMLDivElement | null>; query: string }) {
  const { t } = useTranslation();
  const matches = useRef<HTMLElement[]>([]);
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState(-1);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const collect = () => {
      matches.current = Array.from(element.querySelectorAll<HTMLElement>('.search-match'));
      setCount(matches.current.length);
      setCurrent(-1);
    };
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [query, root]);

  const move = (direction: number) => {
    if (!count) return;
    const index = current < 0 ? direction > 0 ? 0 : count - 1 : (current + direction + count) % count;
    setCurrent(index);
    const match = matches.current[index];
    const wrapper = match.closest('.search-field');
    if (wrapper) {
      const input = wrapper.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      if (input) {
        input.scrollTop = Math.max(0, match.offsetTop - input.clientHeight / 2);
        input.scrollLeft = Math.max(0, match.offsetLeft - input.clientWidth / 2);
        input.dispatchEvent(new Event('scroll'));
      }
      wrapper.scrollIntoView?.({ block: 'center' });
    } else match.scrollIntoView?.({ block: 'center' });
    root.current?.querySelectorAll('.search-match-current').forEach((item) => item.classList.remove('search-match-current'));
    match.classList.add('search-match-current');
  };

  return <div className="note-search-navigation">
    <span role="status">{count ? `${current + 1} / ${count}` : t('search.no_results')}</span>
    <button className="icon-btn" type="button" disabled={!count} aria-label={t('search.previous')} onClick={() => move(-1)}><Icon name="up" /></button>
    <button className="icon-btn" type="button" disabled={!count} aria-label={t('search.next')} onClick={() => move(1)}><Icon name="down" /></button>
  </div>;
}
