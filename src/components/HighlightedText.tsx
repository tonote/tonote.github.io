import { Fragment } from 'react';
import { findMatches } from '../domain/findMatches';

export function HighlightedText({ text, query = '' }: { text: string; query?: string }) {
  const matches = findMatches(text, query);
  let cursor = 0;
  return <>{matches.map(({ from, to }) => {
    const before = text.slice(cursor, from);
    cursor = to;
    return <Fragment key={from}>{before}<mark className="search-match">{text.slice(from, to)}</mark></Fragment>;
  })}{text.slice(cursor)}</>;
}
