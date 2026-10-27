import { create } from 'zustand';

export interface HoldingsFilter {
  search: string;
  sector: string | null;
  performance: 'all' | 'gainers' | 'losers';
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}

/** How far ahead the Fixed Costs "Coming up" card looks, in days. */
export type ComingUpDays = 7 | 14 | 30;

export interface UIState {
  theme: 'light' | 'dark';
  /** Mask every balance on the Net Worth page; persisted in localStorage. */
  hideBalances: boolean;
  /** Fixed Costs "Coming up" window; persisted in localStorage. */
  comingUpDays: ComingUpDays;
  sidebarCollapsed: boolean;
  holdingsFilter: HoldingsFilter;
  etfFilter: HoldingsFilter;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleHideBalances: () => void;
  setComingUpDays: (days: ComingUpDays) => void;
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

function getInitialHideBalances(): boolean {
  try {
    return localStorage.getItem('hideBalances') === 'true';
  } catch {
    return false;
  }
}

function getInitialComingUpDays(): ComingUpDays {
  try {
    const stored = Number(localStorage.getItem('comingUpDays'));
    if (stored === 7 || stored === 14 || stored === 30) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return 7;
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
  hideBalances: getInitialHideBalances(),
  comingUpDays: getInitialComingUpDays(),
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

  toggleHideBalances: () => {
    set((state) => {
      const hideBalances = !state.hideBalances;
      try {
        localStorage.setItem('hideBalances', String(hideBalances));
      } catch {
        // localStorage may be unavailable
      }
      return { hideBalances };
    });
  },

  setComingUpDays: (comingUpDays) => {
    try {
      localStorage.setItem('comingUpDays', String(comingUpDays));
    } catch {
      // localStorage may be unavailable
    }
    set({ comingUpDays });
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
