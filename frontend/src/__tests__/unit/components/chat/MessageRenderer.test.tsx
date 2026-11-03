import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessageRenderer from '../../../../components/chat/messages/MessageRenderer';
import type { ChatHandlers } from '../../../../components/chat/types';
import type { BotMessage } from '../../../../types';

let handlers: ChatHandlers;
beforeEach(() => {
  handlers = { onSend: vi.fn(), onAction: vi.fn(), onNavigate: vi.fn() };
});

function show(message: BotMessage, { hidden = false, interactive = true } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <MessageRenderer
              message={message}
              hidden={hidden}
              interactive={interactive}
              handlers={handlers}
            />
          }
        />
        <Route path="/fixed-costs" element={<p>Fixed Costs page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MessageRenderer', () => {
  it('TextMessage keeps line breaks', () => {
    show({ type: 'text', text: 'Line one\nLine two' });
    expect(screen.getByText(/Line one/)).toHaveClass('whitespace-pre-wrap');
  });

  it('StatCard shows the amount and change, masked when hidden', () => {
    const stat: BotMessage = {
      type: 'stat',
      label: 'Net worth',
      value: 330827.12,
      currency: 'USD',
      delta: 1200,
    };
    const { unmount } = show(stat);
    expect(screen.getByText('$330,827.12')).toBeInTheDocument();
    expect(screen.getByText(/Up/).parentElement).toHaveTextContent('▲ Up $1,200.00');
    unmount();
    show(stat, { hidden: true });
    expect(screen.queryByText('$330,827.12')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••')).toHaveLength(2);
  });

  it("StatCard uses the message's currency", () => {
    show({ type: 'stat', label: 'Balance', value: 50, currency: 'EUR' });
    expect(screen.getByText('€50.00')).toBeInTheDocument();
  });

  it('TransactionTable labels columns and formats amounts and blanks', () => {
    show({
      type: 'table',
      columns: ['Bill', 'Due', 'Amount'],
      rows: [['Gym', null, 45.5]],
    });
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Bill',
      'Due',
      'Amount',
    ]);
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['Gym', '—', '$45.50']);
  });

  it('MiniChart describes its data for screen readers', () => {
    show({
      type: 'chart',
      kind: 'bar',
      series: [
        {
          name: 'Spending',
          points: [
            { label: 'Sep', value: 10 },
            { label: 'Oct', value: 20 },
          ],
        },
      ],
    });
    expect(
      screen.getByRole('img', { name: 'bar chart. Spending: Sep $10.00, Oct $20.00' }),
    ).toBeInTheDocument();
  });

  it('QuickReplies send their action, and only in the latest reply', () => {
    const message: BotMessage = {
      type: 'quickReplies',
      options: [
        { label: 'Next 30 days', action: { type: 'upcomingBills', payload: { withinDays: 30 } } },
      ],
    };
    const { unmount } = show(message);
    fireEvent.click(screen.getByRole('button', { name: 'Next 30 days' }));
    expect(handlers.onAction).toHaveBeenCalledWith(
      { type: 'upcomingBills', payload: { withinDays: 30 } },
      'Next 30 days',
    );
    unmount();
    show(message, { interactive: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('LinkMessage navigates with the router', () => {
    show({ type: 'link', label: 'Open Fixed Costs', route: '/fixed-costs' });
    fireEvent.click(screen.getByRole('link', { name: /Open Fixed Costs/ }));
    expect(screen.getByText('Fixed Costs page')).toBeInTheDocument();
    expect(handlers.onNavigate).toHaveBeenCalled();
  });

  it('ConfirmMessage sends confirm or cancel, and is disabled once answered', () => {
    const message: BotMessage = {
      type: 'confirm',
      prompt: 'Mark Rent as paid?',
      confirmAction: { type: 'markPaid', payload: { billId: 1 } },
      cancelAction: { type: 'cancel' },
    };
    const { unmount } = show(message);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(handlers.onAction).toHaveBeenNthCalledWith(
      1,
      { type: 'markPaid', payload: { billId: 1 } },
      'Yes',
    );
    expect(handlers.onAction).toHaveBeenNthCalledWith(2, { type: 'cancel' }, 'No');
    unmount();
    show(message, { interactive: false });
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
  });

  it('error messages are marked as errors', () => {
    show({ type: 'error', message: 'Balances may be out of date.' });
    expect(screen.getByText(/Balances may be out of date/)).toHaveTextContent(
      'Error: Balances may be out of date.',
    );
  });

  it('an unknown type gets a safe fallback', () => {
    show({ type: 'video', url: 'https://example.com' } as unknown as BotMessage);
    expect(screen.getByText("This part of the answer can't be shown here.")).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
