import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '../../../hooks/useChat';
import { CHAT_URL, chatServer, failOnceWith, received, replyWith } from '../../mocks/chatServer';

beforeAll(() => chatServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  chatServer.resetHandlers();
  received.length = 0;
  sessionStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => chatServer.close());

let client: QueryClient;
beforeEach(() => {
  // The app's client retries mutations; useChat must turn that off itself.
  client = new QueryClient({ defaultOptions: { mutations: { retry: 3 } } });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const TEXT = [{ type: 'text' as const, text: 'Hello.' }];

describe('useChat', () => {
  it('shows the user message at once, then the reply', async () => {
    replyWith(TEXT);
    const onReply = vi.fn();
    const { result } = renderHook(() => useChat({ onReply }), { wrapper });
    act(() => result.current.send('net worth'));

    expect(result.current.entries).toEqual([{ id: 'u0', role: 'user', text: 'net worth' }]);
    await waitFor(() => expect(result.current.pending).toBe(true));
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.entries[1]).toMatchObject({ role: 'bot', message: TEXT[0] });
    expect(received).toEqual([{ sessionId: result.current.sessionId, message: 'net worth' }]);
    expect(onReply).toHaveBeenCalledWith(1);
  });

  it('sends a quick reply as an action, showing its label', async () => {
    replyWith(TEXT);
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() =>
      result.current.sendAction({ type: 'upcomingBills', payload: { withinDays: 7 } }, 'This week'),
    );
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(result.current.entries[0]).toMatchObject({ role: 'user', text: 'This week' });
    expect(received[0]).toMatchObject({
      action: { type: 'upcomingBills', payload: { withinDays: 7 } },
    });
  });

  it('keeps one session id per tab, in sessionStorage', () => {
    const first = renderHook(() => useChat(), { wrapper }).result.current.sessionId;
    const second = renderHook(() => useChat(), { wrapper }).result.current.sessionId;
    expect(first).toBe(second);
    expect(sessionStorage.getItem('finapp.chat.sessionId')).toBe(first);
  });

  it('still works when sessionStorage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    replyWith(TEXT);
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.sessionId).toBeTruthy();
    act(() => result.current.send('hi'));
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
  });

  it('shows the server error and retries the same turn once asked', async () => {
    replyWith(TEXT);
    failOnceWith(429, 'Too many messages. Please wait a moment.', 'rate_limited');
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.send('bills'));
    await waitFor(() =>
      expect(result.current.failure).toEqual({
        message: 'Too many messages. Please wait a moment.',
        canRetry: true,
      }),
    );
    expect(received).toHaveLength(1); // no automatic retry

    act(() => result.current.retry());
    expect(result.current.failure).toBeNull();
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    // The user's message isn't repeated, and the same body was resent.
    expect(result.current.entries.filter((e) => e.role === 'user')).toHaveLength(1);
    expect(received[1]).toEqual(received[0]);
  });

  it.each([
    [401, 'Please sign in to chat.'],
    [422, 'Invalid chat request: message'],
  ])("doesn't offer to retry a %i", async (status, message) => {
    failOnceWith(status, message);
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.send('hi'));
    await waitFor(() => expect(result.current.failure).toEqual({ message, canRetry: false }));
  });

  it('explains when the server can’t be reached', async () => {
    chatServer.use(http.post(CHAT_URL, () => HttpResponse.error()));
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.send('hi'));
    await waitFor(() =>
      expect(result.current.failure).toEqual({
        message: "Couldn't reach the assistant. Check your connection and try again.",
        canRetry: true,
      }),
    );
  });

  it('in development, rejects replies that break the contract', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    replyWith([{ type: 'video', url: 'x' } as never]);
    const { result } = renderHook(() => useChat(), { wrapper });
    act(() => result.current.send('hi'));
    await waitFor(() =>
      expect(result.current.failure).toEqual({
        message: "The assistant sent a reply this app can't read.",
        canRetry: false,
      }),
    );
    expect(result.current.entries).toHaveLength(1);
  });

  it('ignores new turns while waiting for a reply', async () => {
    replyWith(TEXT);
    const { result } = renderHook(() => useChat(), { wrapper });
    // Two sends before React re-renders, as a double click would do.
    act(() => {
      result.current.send('one');
      result.current.send('two');
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    act(() => result.current.retry()); // nothing failed, nothing to resend twice
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(received).toHaveLength(1);
    expect(result.current.entries.map((e) => e.role)).toEqual(['user', 'bot']);
  });
});
