import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a proper localStorage mock before importing the store
const store: Record<string, string> = {};
const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  }),
  get length() {
    return Object.keys(store).length;
  },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
};

vi.stubGlobal('localStorage', localStorageMock);

// Import store AFTER mocking localStorage
const { useUIStore } = await import('../../../store/uiStore');
const initialState = useUIStore.getState();

describe('uiStore', () => {
  beforeEach(() => {
    // Clear the mock store data
    for (const key of Object.keys(store)) {
      delete store[key];
    }
    vi.clearAllMocks();
    // Reset store to initial state
    useUIStore.setState({
      theme: 'light',
      sidebarCollapsed: false,
      holdingsFilter: {
        search: '',
        sector: null,
        performance: 'all',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
  });

  describe('initial state', () => {
    it('should default theme to dark when localStorage is empty', () => {
      expect(initialState.theme).toBe('dark');
    });

    it('should default palette to classic when localStorage is empty', () => {
      expect(initialState.palette).toBe('classic');
    });

    it('should default sidebarCollapsed to false', () => {
      const state = useUIStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
    });

    it('should have correct default holdingsFilter', () => {
      const state = useUIStore.getState();
      expect(state.holdingsFilter).toEqual({
        search: '',
        sector: null,
        performance: 'all',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      });
    });
  });

  describe('setTheme', () => {
    it('should update theme to dark', () => {
      useUIStore.getState().setTheme('dark');
      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('should update theme to light', () => {
      useUIStore.getState().setTheme('dark');
      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('should persist theme to localStorage', () => {
      useUIStore.getState().setTheme('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    it('should update and persist the palette', () => {
      useUIStore.getState().setPalette('brass');
      expect(useUIStore.getState().palette).toBe('brass');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('palette', 'brass');
    });

    it('should persist light theme to localStorage', () => {
      useUIStore.getState().setTheme('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light');
    });
  });

  describe('toggleSidebar', () => {
    it('should toggle sidebarCollapsed from false to true', () => {
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });

    it('should toggle sidebarCollapsed from true to false', () => {
      useUIStore.getState().toggleSidebar();
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('setHoldingsFilter', () => {
    it('should update search field', () => {
      useUIStore.getState().setHoldingsFilter({ search: 'AAPL' });
      expect(useUIStore.getState().holdingsFilter.search).toBe('AAPL');
    });

    it('should update sector field', () => {
      useUIStore.getState().setHoldingsFilter({ sector: 'Technology' });
      expect(useUIStore.getState().holdingsFilter.sector).toBe('Technology');
    });

    it('should update performance field', () => {
      useUIStore.getState().setHoldingsFilter({ performance: 'gainers' });
      expect(useUIStore.getState().holdingsFilter.performance).toBe('gainers');
    });

    it('should update sortColumn and sortDirection', () => {
      useUIStore.getState().setHoldingsFilter({ sortColumn: 'unrealized_gain', sortDirection: 'desc' });
      const filter = useUIStore.getState().holdingsFilter;
      expect(filter.sortColumn).toBe('unrealized_gain');
      expect(filter.sortDirection).toBe('desc');
    });

    it('should merge partial updates without overwriting other fields', () => {
      useUIStore.getState().setHoldingsFilter({ search: 'TSLA' });
      useUIStore.getState().setHoldingsFilter({ sector: 'Automotive' });
      const filter = useUIStore.getState().holdingsFilter;
      expect(filter.search).toBe('TSLA');
      expect(filter.sector).toBe('Automotive');
      expect(filter.performance).toBe('all');
      expect(filter.sortColumn).toBe('ticker');
      expect(filter.sortDirection).toBe('asc');
    });

    it('should allow resetting sector to null', () => {
      useUIStore.getState().setHoldingsFilter({ sector: 'Technology' });
      useUIStore.getState().setHoldingsFilter({ sector: null });
      expect(useUIStore.getState().holdingsFilter.sector).toBeNull();
    });
  });

  describe('theme persistence from localStorage', () => {
    it('should persist and read theme correctly via setTheme', () => {
      useUIStore.getState().setTheme('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
      expect(useUIStore.getState().theme).toBe('dark');
    });
  });
});
