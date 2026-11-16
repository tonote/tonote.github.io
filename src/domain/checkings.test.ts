import { describe, it, expect } from 'vitest';
import { readChecklist, writeChecklist } from './checkings';

describe('checkings codec', () => {
  it('reads content+checkings → items', () => {
    expect(readChecklist('Buy milk\nCall mom\nHeader', '012')).toEqual([
      { text: 'Buy milk', state: 0 },
      { text: 'Call mom', state: 1 },
      { text: 'Header', state: 2 },
    ]);
  });
  it('round-trips', () => {
    const items = [
      { text: 'a', state: 0 as const },
      { text: 'b', state: 1 as const },
      { text: 'c', state: 2 as const },
    ];
    const { content, checkings } = writeChecklist(items);
    expect(readChecklist(content, checkings)).toEqual(items);
  });
  it('handles empty', () => {
    expect(readChecklist('', '')).toEqual([]);
    expect(writeChecklist([])).toEqual({ content: '', checkings: '' });
  });
  it('preserves lines containing only whitespace', () => {
    expect(readChecklist(' \n x', '00')).toEqual([
      { text: ' ', state: 0 }, { text: ' x', state: 0 },
    ]);
  });
});
