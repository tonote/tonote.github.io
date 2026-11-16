import { create } from 'zustand';

interface NavStore {
  currentFolderId: string | null;
  selectedNoteId: string | null;
  viewMode: 'grid' | 'list';
  sidebarOpen: boolean;
  setFolder: (id: string | null) => void;
  openNote: (id: string | null) => void;
  setViewMode: (m: 'grid' | 'list') => void;
  setSidebarOpen: (open: boolean) => void;
}

export const navStore = create<NavStore>((set) => ({
  currentFolderId: null,
  selectedNoteId: null,
  viewMode: 'grid',
  sidebarOpen: false,

  setFolder: (id) => set({ currentFolderId: id }),
  openNote: (id) => set({ selectedNoteId: id }),
  setViewMode: (m) => set({ viewMode: m }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
