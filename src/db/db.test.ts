import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './database.js';
import type { Note, Color } from '../domain/types.js';

// ── Shared setup: wipe and reopen DB before each test ──
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ── notesRepo tests ──
describe('notesRepo', () => {
  it('put and get a note round-trips', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const note: Note = {
      id: 'n1',
      edited: 1000,
      created: 500,
      title: 'Hello',
      content: 'World',
      notify: false,
      showInWidget: false,
      color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state: 0,
      attachments: [],
      priority: 0,
    };
    await notesRepo.put(note);
    const fetched = await notesRepo.get('n1');
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe('Hello');
    expect(fetched!.id).toBe('n1');
  });

  it('bulkPut and all return all notes', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const makeNote = (id: string, parentId?: string): Note => ({
      id,
      edited: 1000,
      created: 500,
      title: `Note ${id}`,
      content: '',
      notify: false,
      showInWidget: false,
      color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state: 0,
      attachments: [],
      priority: 0,
      ...(parentId ? { parentId } : {}),
    });
    await notesRepo.bulkPut([makeNote('n1'), makeNote('n2', 'folderA'), makeNote('n3')]);
    const all = await notesRepo.all();
    expect(all).toHaveLength(3);
  });

  it('byParent(null) returns root notes (parentId undefined or absent)', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const makeNote = (id: string, parentId?: string): Note => ({
      id,
      edited: 1000 + Number(id.slice(1)),
      created: 500,
      title: `Note ${id}`,
      content: '',
      notify: false,
      showInWidget: false,
      color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state: 0,
      attachments: [],
      priority: 0,
      ...(parentId !== undefined ? { parentId } : {}),
    });
    // root1 has NO parentId property (like Gson omit), root2 has parentId undefined
    await notesRepo.bulkPut([
      makeNote('root1'),
      makeNote('root2', undefined),
      makeNote('child1', 'folderA'),
    ]);
    const roots = await notesRepo.byParent(null);
    expect(roots).toHaveLength(2);
    expect(roots.map((n) => n.id).sort()).toEqual(['root1', 'root2']);
  });

  it('byParent("folderA") returns only children of folderA', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const makeNote = (id: string, parentId?: string): Note => ({
      id,
      edited: 1000,
      created: 500,
      title: `Note ${id}`,
      content: '',
      notify: false,
      showInWidget: false,
      color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state: 0,
      attachments: [],
      priority: 0,
      ...(parentId ? { parentId } : {}),
    });
    await notesRepo.bulkPut([
      makeNote('root1'),
      makeNote('child1', 'folderA'),
      makeNote('child2', 'folderA'),
      makeNote('child3', 'folderB'),
    ]);
    const folderAChildren = await notesRepo.byParent('folderA');
    expect(folderAChildren).toHaveLength(2);
    expect(folderAChildren.map((n) => n.id).sort()).toEqual(['child1', 'child2']);
  });

  it('byState returns notes with matching state', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const makeNote = (id: string, state: 0 | 1 | 2 | 3): Note => ({
      id,
      edited: 1000,
      created: 500,
      title: `Note ${id}`,
      content: '',
      notify: false,
      showInWidget: false,
      color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state,
      attachments: [],
      priority: 0,
    });
    await notesRepo.bulkPut([
      makeNote('n1', 0),
      makeNote('n2', 0),
      makeNote('n3', 2), // trashed
    ]);
    const trashed = await notesRepo.byState(2);
    expect(trashed).toHaveLength(1);
    expect(trashed[0].id).toBe('n3');
  });

  it('remove deletes a note', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const note: Note = {
      id: 'n1',
      edited: 1000,
      created: 500,
      title: 'Delete me',
      content: '',
      notify: false,
      showInWidget: false,
      color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state: 0,
      attachments: [],
      priority: 0,
    };
    await notesRepo.put(note);
    await notesRepo.remove('n1');
    const fetched = await notesRepo.get('n1');
    expect(fetched).toBeUndefined();
  });

  it('search filters notes by predicate', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const makeNote = (id: string, title: string): Note => ({
      id,
      edited: 1000,
      created: 500,
      title,
      content: '',
      notify: false,
      showInWidget: false,
      color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state: 0,
      attachments: [],
      priority: 0,
    });
    await notesRepo.bulkPut([
      makeNote('n1', 'Buy groceries'),
      makeNote('n2', 'Read book'),
      makeNote('n3', 'Buy flowers'),
    ]);
    const results = await notesRepo.search((n) => n.title.startsWith('Buy'));
    expect(results).toHaveLength(2);
    expect(results.map((n) => n.id).sort()).toEqual(['n1', 'n3']);
  });

  it('byColor returns notes with matching colorId', async () => {
    const { notesRepo } = await import('./notesRepo.js');
    const makeNote = (id: string, colorId: string): Note => ({
      id,
      edited: 1000,
      created: 500,
      title: `Note ${id}`,
      content: '',
      notify: false,
      showInWidget: false,
      color: { id: colorId, edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
      checkings: '',
      events: [],
      pinned: false,
      state: 0,
      attachments: [],
      priority: 0,
    });
    await notesRepo.bulkPut([
      makeNote('n1', 'red'),
      makeNote('n2', 'blue'),
      makeNote('n3', 'red'),
    ]);
    const redNotes = await notesRepo.byColor('red');
    expect(redNotes).toHaveLength(2);
    expect(redNotes.map((n) => n.id).sort()).toEqual(['n1', 'n3']);
  });
});

// ── colorsRepo tests ──
describe('colorsRepo', () => {
  it('round-trips a color', async () => {
    const { colorsRepo } = await import('./colorsRepo.js');
    const color: Color = {
      id: 'red',
      edited: 1000,
      value: -65536, // opaque red in ARGB
      theme: 'dark',
      showAsFilter: true,
      priority: 1,
    };
    await colorsRepo.put(color);
    const fetched = await colorsRepo.get('red');
    expect(fetched).toBeDefined();
    expect(fetched!.value).toBe(-65536);
  });

  it('bulkPut and all round-trip', async () => {
    const { colorsRepo } = await import('./colorsRepo.js');
    const colors: Color[] = [
      { id: 'red', edited: 1000, value: 0, theme: '', showAsFilter: false, priority: 1 },
      { id: 'blue', edited: 1000, value: 0, theme: '', showAsFilter: false, priority: 2 },
    ];
    await colorsRepo.bulkPut(colors);
    const all = await colorsRepo.all();
    expect(all).toHaveLength(2);
  });

  it('remove deletes a color', async () => {
    const { colorsRepo } = await import('./colorsRepo.js');
    const color: Color = {
      id: 'red', edited: 1000, value: 0, theme: '', showAsFilter: false, priority: 1,
    };
    await colorsRepo.put(color);
    await colorsRepo.remove('red');
    expect(await colorsRepo.get('red')).toBeUndefined();
  });
});

// ── settingsRepo tests ──
describe('settingsRepo', () => {
  it('get returns defaults when no settings row exists', async () => {
    const { settingsRepo } = await import('./settingsRepo.js');
    const settings = await settingsRepo.get();
    expect(settings.key).toBe('default');
    expect(settings.theme).toBe('light');
    expect(settings.layout).toBe('grid');
    expect(settings.sortOrder).toBe('modified');
    expect(settings.defaultKind).toBe('plain');
  });

  it('update patches settings', async () => {
    const { settingsRepo } = await import('./settingsRepo.js');
    await settingsRepo.update({ theme: 'dark', layout: 'list' });
    const settings = await settingsRepo.get();
    expect(settings.theme).toBe('dark');
    expect(settings.layout).toBe('list');
    // unchanged defaults
    expect(settings.sortOrder).toBe('modified');
  });

  it('get after update returns persisted settings', async () => {
    const { settingsRepo } = await import('./settingsRepo.js');
    await settingsRepo.update({ theme: 'dark' });
    // re-import to ensure we read from DB
    const settings2 = await settingsRepo.get();
    expect(settings2.theme).toBe('dark');
  });
});

// ── kvRepo tests ──
describe('kvRepo', () => {
  it('get with defaultValue returns default when key missing', async () => {
    const { kvRepo } = await import('./kvRepo.js');
    expect(await kvRepo.get('missing', 42)).toBe(42);
  });

  it('set and get round-trip', async () => {
    const { kvRepo } = await import('./kvRepo.js');
    await kvRepo.set('foo', { bar: 123 });
    expect(await kvRepo.get('foo')).toEqual({ bar: 123 });
  });

  it('remove deletes key', async () => {
    const { kvRepo } = await import('./kvRepo.js');
    await kvRepo.set('foo', 'val');
    await kvRepo.remove('foo');
    expect(await kvRepo.get('foo', 'fallback')).toBe('fallback');
  });
});

// ── outboxRepo tests ──
describe('outboxRepo', () => {
  it('enqueue and all round-trip', async () => {
    const { outboxRepo } = await import('./outboxRepo.js');
    await outboxRepo.enqueue({ noteId: 'n1', op: 'upsert', queuedAt: Date.now() });
    await outboxRepo.enqueue({ noteId: 'n2', op: 'delete', queuedAt: Date.now() });
    const all = await outboxRepo.all();
    expect(all).toHaveLength(2);
  });

  it('remove deletes by seq', async () => {
    const { outboxRepo } = await import('./outboxRepo.js');
    const entry = await outboxRepo.enqueue({ noteId: 'n1', op: 'upsert', queuedAt: 100 });
    expect(entry.seq).toBeDefined();
    await outboxRepo.remove(entry.seq!);
    expect(await outboxRepo.all()).toHaveLength(0);
  });

  it('clear removes all entries', async () => {
    const { outboxRepo } = await import('./outboxRepo.js');
    await outboxRepo.enqueue({ noteId: 'n1', op: 'upsert', queuedAt: 100 });
    await outboxRepo.enqueue({ noteId: 'n2', op: 'delete', queuedAt: 200 });
    await outboxRepo.clear();
    expect(await outboxRepo.all()).toHaveLength(0);
  });
});

// ── indexMetaRepo tests ──
describe('indexMetaRepo', () => {
  it('get returns undefined when empty', async () => {
    const { indexMetaRepo } = await import('./indexMetaRepo.js');
    expect(await indexMetaRepo.get()).toBeUndefined();
  });

  it('set and get round-trip', async () => {
    const { indexMetaRepo } = await import('./indexMetaRepo.js');
    const meta = {
      key: 'current' as const,
      id: 'session-1',
      updated: Date.now(),
      schemaVersion: 1,
    };
    await indexMetaRepo.set(meta);
    const fetched = await indexMetaRepo.get();
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe('session-1');
    expect(fetched!.schemaVersion).toBe(1);
  });
});
