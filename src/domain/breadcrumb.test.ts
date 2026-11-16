import { describe, it, expect } from 'vitest';
import { buildBreadcrumb, directChildren } from './breadcrumb';
import type { Note } from './types';

const note = (id: string, parentId?: string): Note => ({
  id, edited: 0, created: 0, title: '', content: '',
  notify: false, showInWidget: false,
  color: { id: 'c', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
  checkings: 'f', events: [], pinned: false, state: 0, attachments: [], priority: 0,
  ...(parentId !== undefined ? { parentId } : {}),
});

describe('buildBreadcrumb', () => {
  const notes: Note[] = [
    note('A'),           // root-level (no parentId)
    note('B', 'A'),      // child of A
    note('C', 'B'),      // child of B (3-deep: A → B → C)
  ];

  it('null → empty array', () => {
    expect(buildBreadcrumb(null, notes)).toEqual([]);
  });

  it('single-level: breadcrumb of A (no parent) = [A]', () => {
    expect(buildBreadcrumb('A', notes)).toEqual([notes[0]]);
  });

  it('2-level chain: breadcrumb of B = [A, B]', () => {
    expect(buildBreadcrumb('B', notes)).toEqual([notes[0], notes[1]]);
  });

  it('3-level chain: breadcrumb of C = [A, B, C]', () => {
    expect(buildBreadcrumb('C', notes)).toEqual([notes[0], notes[1], notes[2]]);
  });

  it('unknown folderId → empty array', () => {
    expect(buildBreadcrumb('nonexistent', notes)).toEqual([]);
  });

  it('chain stops at broken link (parentId points to missing note)', () => {
    const broken: Note[] = [
      note('B', 'A'),  // A doesn't exist
      note('C', 'B'),
    ];
    expect(buildBreadcrumb('C', broken)).toEqual([broken[0], broken[1]]);
  });
});

describe('directChildren', () => {
  const notes: Note[] = [
    note('A'),            // root-level
    note('B', 'A'),       // child of A
    note('C', 'A'),       // child of A
    note('D', 'B'),       // child of B
    note('E'),            // root-level
  ];

  it('null → root-level notes (parentId undefined or null)', () => {
    expect(directChildren(null, notes)).toEqual([notes[0], notes[4]]);
  });

  it("directChildren('A') → B and C", () => {
    expect(directChildren('A', notes)).toEqual([notes[1], notes[2]]);
  });

  it("directChildren('D') → empty (D has no children)", () => {
    expect(directChildren('D', notes)).toEqual([]);
  });

  it('empty notes array → empty array', () => {
    expect(directChildren('A', [])).toEqual([]);
  });
});
