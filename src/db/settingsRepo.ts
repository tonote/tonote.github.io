import { db } from './database.js';
import type { Settings } from './database.js';

const DEFAULTS: Settings = {
  key: 'default',
  theme: 'light',
  layout: 'grid',
  sortOrder: 'modified',
  defaultKind: 'plain',
};

export const settingsRepo = {
  async get(): Promise<Settings> {
    const row = await db.settings.get('default');
    if (row) return row;
    return { ...DEFAULTS };
  },

  async update(patch: Partial<Omit<Settings, 'key'>>): Promise<void> {
    const existing = await this.get();
    await db.settings.put({ ...existing, ...patch, key: 'default' });
  },
};
