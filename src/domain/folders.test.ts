import { describe, it, expect } from 'vitest';
import { listDescendantIds, isDescendant, computeCascade, canMoveTo } from './folders';
import type { Note } from './types';
import { NOTE_STATE } from './types';

// Helper to build a minimal note; parentId is optional.
const note = (id: string, parentId?: string, state: NOTE_STATE[keyof typeof NOTE_STATE] = NOTE_STATE.NONE): Note => ({
  id, edited: 0, created: 0, title: '', content: '',
  notify: false, showInWidget: false,
  color: { id: 'c', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
  checkings: 'f', events: [], pinned: false, state, attachments: [], priority: 0,
  ...(parentId !== undefined ? { parentId } : {}),
});

describe('listDescendantIds', () => {
  // Tree: root → A → {B, C}, B → D
  // parentId map: A→root, B→A, C→A, D→B
  const notes: Note[] = [
    note('root'), note('A', 'root'), note('B', 'A'), note('C', 'A'), note('D', 'B'),
  ];

  it('returns all descendants of root', () => {
    expect(listDescendantIds('root', notes)).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('returns descendants of A (B, C, D)', () => {
    expect(listDescendantIds('A', notes)).toEqual(new Set(['B', 'C', 'D']));
  });

  it('returns empty set for leaf node D', () => {
    expect(listDescendantIds('D', notes)).toEqual(new Set());
  });

  it('returns empty set when notes array is empty', () => {
    expect(listDescendantIds('root', [])).toEqual(new Set());
  });
});

describe('isDescendant', () => {
  const notes: Note[] = [
    note('root'), note('A', 'root'), note('B', 'A'), note('C', 'A'), note('D', 'B'),
  ];

  it('D is descendant of root', () => {
    expect(isDescendant('D', 'root', notes)).toBe(true);
  });

  it('D is descendant of A', () => {
    expect(isDescendant('D', 'A', notes)).toBe(true);
  });

  it('D is descendant of B', () => {
    expect(isDescendant('D', 'B', notes)).toBe(true);
  });

  it('D is NOT descendant of C', () => {
    expect(isDescendant('D', 'C', notes)).toBe(false);
  });

  it('D is NOT descendant of D (not its own descendant)', () => {
    expect(isDescendant('D', 'D', notes)).toBe(false);
  });
});

describe('computeCascade', () => {
  it('trash: descendants in NONE become PARENT_REMOVED', () => {
    // Tree: folder → A → B
    const notes: Note[] = [
      note('folder', undefined, NOTE_STATE.NONE),
      note('A', 'folder', NOTE_STATE.NONE),
      note('B', 'A', NOTE_STATE.NONE),
    ];
    const result = computeCascade('folder', NOTE_STATE.REMOVED, notes);
    expect(result).toEqual(new Map([
      ['A', NOTE_STATE.PARENT_REMOVED],
      ['B', NOTE_STATE.PARENT_REMOVED],
    ]));
  });

  it('trash: a descendant already REMOVED stays REMOVED (not overwritten)', () => {
    const notes: Note[] = [
      note('folder', undefined, NOTE_STATE.NONE),
      note('A', 'folder', NOTE_STATE.REMOVED),
    ];
    const result = computeCascade('folder', NOTE_STATE.REMOVED, notes);
    // A is already REMOVED, so it should NOT appear in the cascade map
    expect(result).toEqual(new Map());
  });

  it('trash: nested folders cascade through', () => {
    // folder → subFolder → child
    const notes: Note[] = [
      note('folder', undefined, NOTE_STATE.NONE),
      note('subFolder', 'folder', NOTE_STATE.NONE),
      note('child', 'subFolder', NOTE_STATE.NONE),
    ];
    const result = computeCascade('folder', NOTE_STATE.REMOVED, notes);
    expect(result).toEqual(new Map([
      ['subFolder', NOTE_STATE.PARENT_REMOVED],
      ['child', NOTE_STATE.PARENT_REMOVED],
    ]));
  });

  it('restore: PARENT_REMOVED descendants revert to NONE', () => {
    const notes: Note[] = [
      note('folder', undefined, NOTE_STATE.REMOVED),
      note('A', 'folder', NOTE_STATE.PARENT_REMOVED),
      note('B', 'A', NOTE_STATE.PARENT_REMOVED),
    ];
    const result = computeCascade('folder', NOTE_STATE.NONE, notes);
    expect(result).toEqual(new Map([
      ['A', NOTE_STATE.NONE],
      ['B', NOTE_STATE.NONE],
    ]));
  });

  it('restore: ARCHIVED descendant is NOT touched', () => {
    const notes: Note[] = [
      note('folder', undefined, NOTE_STATE.REMOVED),
      note('A', 'folder', NOTE_STATE.ARCHIVED),
    ];
    const result = computeCascade('folder', NOTE_STATE.NONE, notes);
    // A is ARCHIVED, not PARENT_REMOVED, so it should NOT appear in the map
    expect(result).toEqual(new Map());
  });
});

describe('canMoveTo', () => {
  const notes: Note[] = [
    note('root'), note('A', 'root'), note('B', 'A'), note('C', 'A'), note('D', 'B'),
  ];

  it('move D into root → true', () => {
    expect(canMoveTo('D', 'root', notes)).toBe(true);
  });

  it('move D into D → false (cannot move into itself)', () => {
    expect(canMoveTo('D', 'D', notes)).toBe(false);
  });

  it('move root into A → false (A is descendant of root)', () => {
    expect(canMoveTo('root', 'A', notes)).toBe(false);
  });

  it('move A into C → false (C IS a descendant of A — cycle)', () => {
    expect(canMoveTo('A', 'C', notes)).toBe(false);
  });

  it('move B into A → true (A is ancestor of B, not a descendant — no cycle)', () => {
    expect(canMoveTo('B', 'A', notes)).toBe(true);
  });
});
