import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';

/**
 * A minimal component that replicates the dark mode logic from App.tsx
 * to test the document.documentElement class toggling in isolation.
 */
function DarkModeApplier() {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return <div data-testid="dark-mode-applier">{theme}</div>;
}

describe('Dark mode class toggling', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    useUIStore.setState({ theme: 'light' });
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('should add dark class to document.documentElement when theme is dark', () => {
    render(<DarkModeApplier />);

    act(() => {
      useUIStore.getState().setTheme('dark');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should remove dark class from document.documentElement when theme is light', () => {
    document.documentElement.classList.add('dark');
    useUIStore.setState({ theme: 'dark' });

    render(<DarkModeApplier />);

    act(() => {
      useUIStore.getState().setTheme('light');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should apply dark class on initial render when theme is dark', () => {
    useUIStore.setState({ theme: 'dark' });

    render(<DarkModeApplier />);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should not have dark class on initial render when theme is light', () => {
    useUIStore.setState({ theme: 'light' });

    render(<DarkModeApplier />);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('AppLayout responsive structure', () => {
  it('should have overflow-hidden on root layout to prevent horizontal scrolling', async () => {
    const { default: AppLayout } = await import('../../components/layout/AppLayout');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AppLayout />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // The root div should have overflow-hidden class
    const rootDiv = document.querySelector('.flex.h-screen.overflow-hidden');
    expect(rootDiv).not.toBeNull();
  });

  it('should have mobile menu toggle button with correct aria-label', async () => {
    const { default: AppLayout } = await import('../../components/layout/AppLayout');

    // Collapse sidebar to show the toggle button
    useUIStore.setState({ sidebarCollapsed: true });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AppLayout />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const toggleButton = screen.getByLabelText('Open sidebar');
    expect(toggleButton).toBeInTheDocument();
  });

  it('sidebar should have lg:static and lg:translate-x-0 for desktop visibility', async () => {
    const { default: AppLayout } = await import('../../components/layout/AppLayout');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AppLayout />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const sidebar = document.querySelector('aside');
    expect(sidebar).not.toBeNull();
    // Verify the sidebar has the responsive classes for collapsing below 1024px
    expect(sidebar!.className).toContain('lg:translate-x-0');
    expect(sidebar!.className).toContain('lg:static');
  });
});

describe('Table styling requirements', () => {
  it('DataTable should enforce minimum font size, row height, and padding on cells', async () => {
    const { default: DataTable } = await import('../../components/shared/DataTable');

    const columns = [
      { key: 'name', header: 'Name', sortable: true },
      { key: 'value', header: 'Value', sortable: true },
    ];

    const data = [{ name: 'Test', value: 42 }];

    render(<DataTable columns={columns} data={data} keyExtractor={(row) => String(row.name)} />);

    // Check table cells have correct inline styles
    const cells = document.querySelectorAll('td');
    cells.forEach((cell) => {
      expect(cell.style.fontSize).toBe('14px');
      expect(cell.style.padding).toBe('8px');
      expect(cell.style.minHeight).toBe('40px');
    });

    // Check header cells have minimum padding and height
    const headers = document.querySelectorAll('th');
    headers.forEach((header) => {
      expect(header.style.padding).toBe('8px');
      expect(header.style.minHeight).toBe('40px');
    });
  });

  it('DataTable wrapper should have overflow-x-auto for horizontal scroll containment', async () => {
    const { default: DataTable } = await import('../../components/shared/DataTable');

    const columns = [{ key: 'name', header: 'Name', sortable: false }];
    const data = [{ name: 'Test' }];

    render(<DataTable columns={columns} data={data} keyExtractor={(row) => String(row.name)} />);

    const wrapper = document.querySelector('.overflow-x-auto');
    expect(wrapper).not.toBeNull();
  });
});
