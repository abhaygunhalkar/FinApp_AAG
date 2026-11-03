import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatLauncher, ChatWidget } from '../../../../components/chat';
import { useUIStore } from '../../../../store/uiStore';
import { chatServer, failOnceWith, received, replyWith } from '../../../mocks/chatServer';

beforeAll(() => chatServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  chatServer.resetHandlers();
  received.length = 0;
});
afterAll(() => chatServer.close());
beforeEach(() => useUIStore.setState({ hideBalances: false }));

const renderWidget = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    </QueryClientProvider>,
  );

async function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
  return screen.findByRole('dialog', { name: 'Assistant' });
}

describe('ChatLauncher', () => {
  it('is labelled, and shows unread messages', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<ChatLauncher onOpen={onOpen} unread={0} />);
    const button = screen.getByRole('button', { name: 'Open assistant' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
    rerender(<ChatLauncher onOpen={onOpen} unread={12} />);
    expect(screen.getByRole('button', { name: 'Open assistant, 12 unread' })).toHaveTextContent(
      '9+',
    );
  });
});

describe('ChatWidget', () => {
  it('loads the panel only when opened', async () => {
    renderWidget();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await openPanel();
    expect(screen.queryByRole('button', { name: 'Open assistant' })).not.toBeInTheDocument();
  });

  it('asks the API and shows the answer; a chip sends its action', async () => {
    replyWith([
      { type: 'stat', label: 'Net worth', value: 1234.5, currency: 'USD' },
      {
        type: 'quickReplies',
        options: [{ label: 'Account balances', action: { type: 'balances' } }],
      },
    ]);
    renderWidget();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: "What's my net worth?" }));
    expect(screen.getByRole('log')).toHaveTextContent("You: What's my net worth?");
    expect(await screen.findByText('$1,234.50')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Account balances' }));
    expect(screen.getByRole('log')).toHaveTextContent('You: Account balances');
    await screen.findAllByText('$1,234.50');
    expect(received[1]).toMatchObject({ action: { type: 'balances' } });
  });

  it('shows a failure with Try again, which resends', async () => {
    replyWith([{ type: 'text', text: 'Back now.' }]);
    failOnceWith(504, 'That took too long. Please try again.', 'timeout');
    renderWidget();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Will I have enough to cover my bills?' }));
    expect(await screen.findByText('That took too long. Please try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Back now.')).toBeInTheDocument();
    expect(screen.queryByText('That took too long. Please try again.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveFocus();
  });

  it('keeps focus in the panel after an example is clicked, and Escape still closes', async () => {
    replyWith([{ type: 'text', text: 'ok' }]);
    renderWidget();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Will I have enough to cover my bills?' }));
    expect(screen.getByLabelText('Message')).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await screen.findByRole('button', { name: /Open assistant, 1 unread/ });
  });

  it('New chat clears the chat and brings back the examples', async () => {
    replyWith([{ type: 'text', text: 'Hello.' }]);
    renderWidget();
    await openPanel();
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "What's my net worth?" }));
    await screen.findByText('Hello.');
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryByText('Hello.')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Example questions' })).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveFocus();
    // The next question goes to a new server session.
    fireEvent.click(screen.getByRole('button', { name: "What's my net worth?" }));
    await screen.findByText('Hello.');
    const [first, second] = received as { sessionId: string }[];
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('counts replies that arrive while minimized, and clears them on open', async () => {
    replyWith([
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ]);
    renderWidget();
    await openPanel();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hi' } });
    fireEvent.submit(screen.getByLabelText('Message').closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize assistant' }));
    await screen.findByRole('button', { name: 'Expand assistant' });
    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    const launcher = await screen.findByRole('button', { name: 'Open assistant, 2 unread' });
    await vi.waitFor(() => expect(launcher).toHaveFocus());
    fireEvent.click(launcher);
    expect(await screen.findByText('two')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open assistant' })).toBeInTheDocument();
  });
});
