export interface CheckableItem { text: string; state: 0 | 1 | 2; }

export function readChecklist(content: string, checkings: string): CheckableItem[] {
  if (content === '') return [];
  const lines = content.split('\n');
  const states = checkings.split('');
  return lines.map((text, i) => ({ text, state: (Number(states[i] ?? '0') || 0) as 0 | 1 | 2 }));
}

export function writeChecklist(items: CheckableItem[]): { content: string; checkings: string } {
  if (items.length === 0) return { content: '', checkings: '' };
  return {
    content: items.map(i => i.text).join('\n'),
    checkings: items.map(i => String(i.state)).join(''),
  };
}
