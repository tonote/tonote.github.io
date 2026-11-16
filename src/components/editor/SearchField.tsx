import { useLayoutEffect, useRef } from 'react';
import { HighlightedText } from '../HighlightedText';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  query?: string;
  className: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  autoGrow?: boolean;
  readOnly?: boolean;
}

/** Mirror only the match backgrounds; editing and selection stay native. */
export function SearchField({ value, onChange, query = '', className, label, placeholder, multiline = false, autoGrow = false, readOnly = false }: SearchFieldProps) {
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const syncScroll = () => {
    if (field.current && mirror.current) {
      mirror.current.scrollTop = field.current.scrollTop;
      mirror.current.scrollLeft = field.current.scrollLeft;
    }
  };
  useLayoutEffect(() => {
    const input = field.current;
    if (!input) return;
    const resize = () => {
      if (autoGrow) {
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
      }
      // Match the text area excluding its scrollbar gutter.
      if (mirror.current) mirror.current.style.width = `${input.clientWidth}px`;
      syncScroll();
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(input);
    return () => observer?.disconnect();
  }, [value, query, autoGrow]);
  const props = {
    className, value, placeholder, readOnly, 'aria-label': label,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onScroll: syncScroll,
  };
  return <div className={`search-field ${multiline ? 'multiline' : 'singleline'}`}>
    {query.trim() && <div ref={mirror} className={`search-mirror ${className}`} aria-hidden="true"><HighlightedText text={value} query={query} />{'\u200b'}</div>}
    {multiline
      ? <textarea {...props} ref={(element) => { field.current = element; }} rows={autoGrow ? 1 : undefined} />
      : <input {...props} ref={(element) => { field.current = element; }} type="text" />}
  </div>;
}
