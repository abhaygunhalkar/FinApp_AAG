import { create } from 'zustand';

export interface HoldingsFilter {
  search: string;
  sector: string | null;
  performance: 'all' | 'gainers' | 'losers';
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}

export interface UIState {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  holdingsFilter: HoldingsFilter;
  etfFilter: HoldingsFilter;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setHoldingsFilter: (filter: Partial<HoldingsFilter>) => void;
  setEtfFilter: (filter: Partial<HoldingsFilter>) => void;
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (e.g., SSR or privacy mode)
  }
  return 'light';
}

const defaultFilter: HoldingsFilter = {
  search: '',
  sector: null,
  performance: 'all',
  sortColumn: 'ticker',
  sortDirection: 'asc',
};

export const useUIStore = create<UIState>((set) => ({
  theme: getInitialTheme(),
  sidebarCollapsed: false,
  holdingsFilter: { ...defaultFilter },
  etfFilter: { ...defaultFilter },

  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // localStorage may be unavailable
    }
    set({ theme });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setHoldingsFilter: (filter) => {
    set((state) => ({
      holdingsFilter: { ...state.holdingsFilter, ...filter },
    }));
  },

  setEtfFilter: (filter) => {
    set((state) => ({
      etfFilter: { ...state.etfFilter, ...filter },
    }));
  },
}));
