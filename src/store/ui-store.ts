import { create } from 'zustand';

/**
 * Shared shell UI state (modals, toasts, sidebar/nav visibility).
 *
 * This store is intentionally free of demo seed data and engine imports so
 * production shells can depend on it without pulling in the simulated demo
 * domain (see `src/store/graph-store.ts`, which is demo-only).
 */
export interface UiStoreState {
  isNavMenuOpen: boolean;
  isSidebarCollapsed: boolean;
  toastMessage: string | null;
  activeModal: string | null; // 'brain' | 'search' | demo modal kinds | null
  modalData: any;

  toggleNavMenu: () => void;
  toggleSidebar: () => void;
  closeNavMenu: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  showToast: (msg: string) => void;
  openModal: (modalName: string, data?: any) => void;
  closeModal: () => void;
}

export const useUiStore = create<UiStoreState>((set, get) => ({
  isNavMenuOpen: false,
  isSidebarCollapsed: false,
  toastMessage: null,
  activeModal: null,
  modalData: null,

  toggleNavMenu: () => {
    set((s) => ({ isNavMenuOpen: !s.isNavMenuOpen }));
  },

  toggleSidebar: () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 850px)').matches) {
      set((s) => ({ isNavMenuOpen: !s.isNavMenuOpen }));
      return;
    }

    set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed }));
  },

  closeNavMenu: () => {
    set({ isNavMenuOpen: false });
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    set({ isSidebarCollapsed: collapsed });
  },

  showToast: (msg: string) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      if (get().toastMessage === msg) {
        set({ toastMessage: null });
      }
    }, 3500);
  },

  openModal: (modalName: string, data?: any) => {
    set({ activeModal: modalName, modalData: data });
  },

  closeModal: () => {
    set({ activeModal: null, modalData: null });
  },
}));
