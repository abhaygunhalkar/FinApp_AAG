import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatLauncher, ChatWidget } from '../../../../components/chat';
import { useUIStore } from '../../../../store/uiStore';

const renderWidget = () =>
  render(
    <MemoryRouter>
      <ChatWidget />
    </MemoryRouter>,
  );

beforeEach(() => useUIStore.setState({ hideBalances: false }));
afterEach(() => vi.useRealTimers());

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
    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    expect(await screen.findByRole('dialog', { name: 'Assistant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open assistant' })).not.toBeInTheDocument();
  });

  it('shows what was sent, then a mock reply with starter chips', async () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByRole('dialog');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: "What's my net worth?" }));
    expect(screen.getByRole('log')).toHaveTextContent("You: What's my net worth?");
    expect(screen.getByRole('status')).toHaveTextContent('Assistant is typing');
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getByRole('log')).toHaveTextContent("I'm not connected yet");
    // Clicking a chip shows its label as the user's turn.
    fireEvent.click(screen.getByRole('button', { name: 'Account balances' }));
    expect(screen.getByRole('log')).toHaveTextContent('You: Account balances');
  });

  it('keeps focus in the panel after an example is clicked, and Escape still closes', async () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Show my account balances' }));
    expect(screen.getByLabelText('Message')).toHaveFocus();
    // Even with focus on the page itself, Escape closes the panel.
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('counts replies that arrive while minimized, and clears them on open', async () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    await screen.findByRole('dialog');
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hi' } });
    fireEvent.submit(screen.getByLabelText('Message').closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize assistant' }));
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    act(() => void vi.advanceTimersByTime(10));
    const launcher = screen.getByRole('button', { name: 'Open assistant, 2 unread' });
    expect(launcher).toHaveFocus();
    fireEvent.click(launcher);
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open assistant' })).toBeInTheDocument();
  });
});
