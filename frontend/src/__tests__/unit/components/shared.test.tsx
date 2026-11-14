import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EmptyState from '../../../components/shared/EmptyState';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import ErrorNotification from '../../../components/shared/ErrorNotification';
import DeleteConfirmation from '../../../components/shared/DeleteConfirmation';
import DataTable from '../../../components/shared/DataTable';
import type { Column } from '../../../components/shared/DataTable';

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(
      <EmptyState
        icon={<span data-testid="icon">📦</span>}
        title="No items"
        description="There are no items to display."
      />,
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('There are no items to display.')).toBeInTheDocument();
  });

  it('renders action button when actionLabel and onAction are provided', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        icon={<span>📦</span>}
        title="No items"
        description="Add your first item."
        actionLabel="Add Item"
        onAction={onAction}
      />,
    );

    const button = screen.getByText('Add Item');
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render action button when actionLabel is missing', () => {
    render(<EmptyState icon={<span>📦</span>} title="No items" description="Nothing here." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('LoadingSpinner', () => {
  it('renders with default medium size', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    const svg = status.querySelector('svg');
    expect(svg).toHaveClass('animate-spin', 'h-8', 'w-8');
  });

  it('renders with small size', () => {
    render(<LoadingSpinner size="sm" />);
    const svg = screen.getByRole('status').querySelector('svg');
    expect(svg).toHaveClass('h-4', 'w-4');
  });

  it('renders with large size', () => {
    render(<LoadingSpinner size="lg" />);
    const svg = screen.getByRole('status').querySelector('svg');
    expect(svg).toHaveClass('h-12', 'w-12');
  });

  it('has accessible loading text', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('ErrorNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders error message', () => {
    render(<ErrorNotification message="Something went wrong" onDismiss={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<ErrorNotification message="Error" onDismiss={onDismiss} />);

    const dismissButton = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after 5 seconds by default', () => {
    const onDismiss = vi.fn();
    render(<ErrorNotification message="Error" onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after custom duration', () => {
    const onDismiss = vi.fn();
    render(<ErrorNotification message="Error" onDismiss={onDismiss} autoDismissMs={3000} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has role alert for accessibility', () => {
    render(<ErrorNotification message="Error" onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('DeleteConfirmation', () => {
  it('renders title and message', () => {
    render(
      <DeleteConfirmation
        title="Delete Holding"
        message="Are you sure you want to delete this holding?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Delete Holding')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this holding?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmation
        title="Delete Holding"
        message="Confirm?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <DeleteConfirmation
        title="Delete"
        message="Confirm?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom button labels', () => {
    render(
      <DeleteConfirmation
        title="Remove"
        message="Remove item?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        confirmLabel="Yes, Remove"
        cancelLabel="No, Keep"
      />,
    );

    expect(screen.getByText('Yes, Remove')).toBeInTheDocument();
    expect(screen.getByText('No, Keep')).toBeInTheDocument();
  });

  it('has dialog role for accessibility', () => {
    render(
      <DeleteConfirmation
        title="Delete"
        message="Confirm?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  interface TestRow extends Record<string, unknown> {
    id: number;
    name: string;
    value: number;
  }

  const columns: Column<TestRow>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'value', header: 'Value', sortable: true },
  ];

  const data: TestRow[] = [
    { id: 1, name: 'Apple', value: 150 },
    { id: 2, name: 'Google', value: 2800 },
    { id: 3, name: 'Microsoft', value: 300 },
  ];

  it('renders table headers', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={(row) => row.id} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('renders all data rows', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={(row) => row.id} />);

    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Microsoft')).toBeInTheDocument();
  });

  it('sorts data when clicking a sortable column header', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={(row) => row.id} />);

    // Click Name header to sort ascending
    fireEvent.click(screen.getByText('Name'));

    const rows = screen.getAllByRole('row');
    // First row is header, data rows start at index 1
    expect(rows[1]).toHaveTextContent('Apple');
    expect(rows[2]).toHaveTextContent('Google');
    expect(rows[3]).toHaveTextContent('Microsoft');
  });

  it('toggles sort direction on repeated clicks', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={(row) => row.id} />);

    // Click Value header twice for descending
    fireEvent.click(screen.getByText('Value'));
    fireEvent.click(screen.getByText('Value'));

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Google');
    expect(rows[2]).toHaveTextContent('Microsoft');
    expect(rows[3]).toHaveTextContent('Apple');
  });

  it('calls onSortChange callback', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(row) => row.id}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByText('Name'));
    expect(onSortChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('renders custom cell content via render function', () => {
    const columnsWithRender: Column<TestRow>[] = [
      { key: 'name', header: 'Name' },
      {
        key: 'value',
        header: 'Value',
        render: (row) => <span data-testid="custom">${row.value}</span>,
      },
    ];

    render(
      <DataTable columns={columnsWithRender} data={[data[0]]} keyExtractor={(row) => row.id} />,
    );

    expect(screen.getByTestId('custom')).toHaveTextContent('$150');
  });

  it('applies minimum font size, row height, and cell padding', () => {
    render(<DataTable columns={columns} data={data} keyExtractor={(row) => row.id} />);

    const cells = screen.getAllByRole('cell');
    const firstCell = cells[0];
    expect(firstCell).toHaveStyle({ fontSize: '14px', padding: '8px', minHeight: '40px' });
  });

  it('has responsive horizontal scroll container', () => {
    const { container } = render(
      <DataTable columns={columns} data={data} keyExtractor={(row) => row.id} />,
    );

    const scrollContainer = container.firstElementChild;
    expect(scrollContainer).toHaveClass('overflow-x-auto');
  });
});
