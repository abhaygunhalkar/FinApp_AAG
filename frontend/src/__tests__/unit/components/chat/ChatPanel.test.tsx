import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanel, { type ChatPanelProps } from '../../../../components/chat/ChatPanel';
import { EXAMPLE_QUESTIONS } from '../../../../components/chat/examples';
import type { ChatEntry } from '../../../../components/chat/types';

// A mock conversation with every kind of bot message.
const CONVERSATION: ChatEntry[] = [
  { id: 'u1', role: 'user', text: 'what do I owe?' },
  { id: 'b1', role: 'bot', message: { type: 'text', text: 'Here you go.' } },
  {
    id: 'b2',
    role: 'bot',
    message: { type: 'stat', label: 'Net worth', value: 330827.12, currency: 'USD', delta: -1200 },
  },
  {
    id: 'b3',
    role: 'bot',
    message: {
      type: 'table',
      columns: ['Bill', 'Due', 'Amount'],
      rows: [
        ['Rent', 'Nov 5', 2400],
        ['Gym', null, 45.5],
      ],
    },
  },
  {
    id: 'b4',
    role: 'bot',
    message: {
      type: 'chart',
      kind: 'pie',
      series: [{ name: 'Assets', points: [{ label: 'Cash', value: 10 }] }],
    },
  },
  {
    id: 'b5',
    role: 'bot',
    message: {
      type: 'confirm',
      prompt: 'Mark Rent as paid?',
      confirmAction: { type: 'markPaid', payload: { billId: 1 } },
      cancelAction: { type: 'cancel' },
    },
  },
  { id: 'u2', role: 'user', text: 'show bills' },
  {
    id: 'b6',
    role: 'bot',
    message: { type: 'link', label: 'Open Fixed Costs', route: '/fixed-costs' },
  },
  { id: 'b7', role: 'bot', message: { type: 'error', message: 'Balances may be out of date.' } },
  {
    id: 'b8',
    role: 'bot',
    message: {
      type: 'quickReplies',
      options: [{ label: 'Net worth', action: { type: 'netWorth' } }],
    },
  },
];

let props: ChatPanelProps;

beforeEach(() => {
  props = {
    state: 'open',
    entries: [],
    pending: false,
    hidden: false,
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    onExpand: vi.fn(),
    onSend: vi.fn(),
    onAction: vi.fn(),
    onNavigate: vi.fn(),
  };
});

const renderPanel = (overrides: Partial<ChatPanelProps> = {}) =>
  render(
    <MemoryRouter>
      <ChatPanel {...props} {...overrides} />
    </MemoryRouter>,
  );

describe('ChatPanel: dialog', () => {
  it('is a labelled modal dialog with the input focused', () => {
    renderPanel();
    const dialog = screen.getByRole('dialog', { name: 'Assistant' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Message')).toHaveFocus();
  });

  it('closes on Escape and from the close button; minimizes from its button', () => {
    renderPanel();
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize assistant' }));
    expect(props.onMinimize).toHaveBeenCalled();
  });

  it('keeps Tab and Shift+Tab inside the panel', () => {
    renderPanel();
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button');
    const first = buttons[0]; // Minimize
    const last = screen.getByRole('button', { name: 'Send' }); // disabled while empty
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hi' } });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('minimized, it shows a small bar that expands or closes', () => {
    renderPanel({ state: 'minimized' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand assistant' }));
    expect(props.onExpand).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('ChatPanel: empty state and input', () => {
  it('offers the four example questions, which send when clicked', () => {
    renderPanel();
    const list = screen.getByRole('list', { name: 'Example questions' });
    const chips = within(list).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(EXAMPLE_QUESTIONS);
    expect(chips).toHaveLength(4);
    fireEvent.click(chips[2]);
    expect(props.onSend).toHaveBeenCalledWith('What bills are due this week?');
  });

  it('sends trimmed text with Enter and clears the box', () => {
    renderPanel();
    const input = screen.getByLabelText('Message');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: '  net worth  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(props.onSend).toHaveBeenCalledWith('net worth');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('maxLength', '2000');
  });

  it("can't send while waiting for a reply", () => {
    renderPanel({ entries: CONVERSATION, pending: true });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Assistant is typing');
  });
});

describe('ChatPanel: messages', () => {
  it('announces the conversation politely and scrolls to the latest', () => {
    const { rerender } = renderPanel({ entries: CONVERSATION.slice(0, 2) });
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(log).toHaveAttribute('aria-live', 'polite');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 900 });
    rerender(
      <MemoryRouter>
        <ChatPanel {...props} entries={CONVERSATION} />
      </MemoryRouter>,
    );
    expect(log.scrollTop).toBe(900);
  });

  it('draws every message type', () => {
    renderPanel({ entries: CONVERSATION });
    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('You: what do I owe?');
    expect(log).toHaveTextContent('Here you go.');
    expect(log).toHaveTextContent('Net worth$330,827.12▼ Down $1,200.00');
    const table = within(log).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Bill', 'Due', 'Amount']);
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('Gym—$45.50');
    expect(
      within(log).getByRole('img', { name: /pie chart\. Assets: Cash \$10\.00/ }),
    ).toBeTruthy();
    expect(within(log).getByRole('link', { name: /Open Fixed Costs/ })).toHaveAttribute(
      'href',
      '/fixed-costs',
    );
    expect(log).toHaveTextContent('Error: Balances may be out of date.');
  });

  it('masks amounts when numbers are hidden', () => {
    renderPanel({ entries: CONVERSATION, hidden: true });
    const log = screen.getByRole('log');
    expect(log).not.toHaveTextContent('330,827');
    expect(log).not.toHaveTextContent('2,400');
    expect(log).toHaveTextContent('••••••');
  });

  it("only the latest reply's buttons act", () => {
    renderPanel({ entries: CONVERSATION });
    // The confirm is from an earlier turn.
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Net worth' }));
    expect(props.onAction).toHaveBeenCalledWith({ type: 'netWorth' }, 'Net worth');
  });

  it('confirm buttons send their actions when current', () => {
    renderPanel({ entries: CONVERSATION.slice(0, 6) });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(props.onAction).toHaveBeenNthCalledWith(
      1,
      { type: 'markPaid', payload: { billId: 1 } },
      'Yes',
    );
    expect(props.onAction).toHaveBeenNthCalledWith(2, { type: 'cancel' }, 'No');
  });

  it('earlier quick replies are not shown', () => {
    const older: ChatEntry[] = [
      ...CONVERSATION,
      { id: 'u3', role: 'user', text: 'thanks' },
      { id: 'b9', role: 'bot', message: { type: 'text', text: 'Any time.' } },
    ];
    renderPanel({ entries: older });
    expect(screen.queryByRole('group', { name: 'Suggested replies' })).not.toBeInTheDocument();
  });

  it('following a link tells the widget', () => {
    renderPanel({ entries: CONVERSATION });
    fireEvent.click(screen.getByRole('link', { name: /Open Fixed Costs/ }));
    expect(props.onNavigate).toHaveBeenCalled();
  });
});
