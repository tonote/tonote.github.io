import { track } from '../analytics';
import { create } from 'zustand';
import { settingsRepo } from '../db/settingsRepo.js';

type Theme = 'light' | 'dark';
type Layout = 'grid' | 'list';
type SortOrder = 'modified' | 'created' | 'priority';
type DefaultKind = 'plain' | 'rich' | 'list';

interface SettingsStore {
  theme: Theme;
  layout: Layout;
  sortOrder: SortOrder;
  defaultKind: DefaultKind;
  setTheme: (t: Theme) => void;
  setLayout: (l: Layout) => void;
  setSortOrder: (s: SortOrder) => void;
  setDefaultKind: (k: DefaultKind) => void;
  init: () => Promise<void>;
}

export const settingsStore = create<SettingsStore>((set) => ({
  theme: 'light',
  layout: 'grid',
  sortOrder: 'modified',
  defaultKind: 'plain',

  setTheme: (t) => {
    set({ theme: t });
    track('theme_change', { theme: t });
    void settingsRepo.update({ theme: t });
  },
  setLayout: (l) => {
    set({ layout: l });
    void settingsRepo.update({ layout: l });
  },
  setSortOrder: (s) => {
    set({ sortOrder: s });
    void settingsRepo.update({ sortOrder: s });
  },
  setDefaultKind: (k) => {
    set({ defaultKind: k });
    void settingsRepo.update({ defaultKind: k });
  },

  init: async () => {
    const settings = await settingsRepo.get();
    set({
      theme: settings.theme,
      layout: settings.layout,
      sortOrder: settings.sortOrder,
      defaultKind: settings.defaultKind,
    });
  },
}));
