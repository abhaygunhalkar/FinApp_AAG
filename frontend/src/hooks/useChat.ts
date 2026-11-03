import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChatApiError, sendChat } from '../api/chat';
import type { ChatEntry } from '../components/chat/types';
import type { ChatAction, ChatRequest } from '../types';

const SESSION_KEY = 'finapp.chat.sessionId';

function newSessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** This tab's conversation id; kept in sessionStorage when it's available. */
function loadSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
  } catch {
    // Storage blocked (privacy mode, sandbox): use an id for this page only.
  }
  const id = newSessionId();
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // As above.
  }
  return id;
}

export interface ChatFailure {
  message: string;
  canRetry: boolean;
}

export interface UseChatOptions {
  /** Called with the number of bot messages each time a reply arrives. */
  onReply?: (count: number) => void;
}

/**
 * The conversation with the assistant: sends turns to POST /api/chat, shows
 * the user's message straight away, and keeps the bot's replies.
 */
export function useChat({ onReply }: UseChatOptions = {}) {
  const [sessionId] = useState(loadSessionId);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const lastRequest = useRef<ChatRequest | null>(null);
  const nextId = useRef(0);
  const onReplyRef = useRef(onReply);
  // Set the moment a turn is sent, so a double click can't send it twice
  // before React re-renders with isPending.
  const inFlight = useRef(false);
  // Only a turn that failed can be retried.
  const failed = useRef(false);

  useEffect(() => {
    onReplyRef.current = onReply;
  }, [onReply]);

  const mutation = useMutation({
    mutationFn: sendChat,
    // Never resend automatically: a repeated action could act twice.
    retry: false,
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: (response) => {
      setEntries((prev) => [
        ...prev,
        ...response.messages.map((message) => ({
          id: `b${nextId.current++}`,
          role: 'bot' as const,
          message,
        })),
      ]);
      onReplyRef.current?.(response.messages.length);
    },
    onError: (err) => {
      failed.current = true;
      setFailure(
        err instanceof ChatApiError
          ? { message: err.message, canRetry: err.retryable }
          : { message: 'Something went wrong.', canRetry: true },
      );
      onReplyRef.current?.(1);
    },
  });
  const { mutate, isPending } = mutation;

  const submit = useCallback(
    (turn: { message: string } | { action: ChatAction }, shown: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      failed.current = false;
      setFailure(null);
      setEntries((prev) => [...prev, { id: `u${nextId.current++}`, role: 'user', text: shown }]);
      const request: ChatRequest = { sessionId, ...turn };
      lastRequest.current = request;
      mutate(request);
    },
    [mutate, sessionId],
  );

  const send = useCallback((text: string) => submit({ message: text }, text), [submit]);

  const sendAction = useCallback(
    (action: ChatAction, label: string) => submit({ action }, label),
    [submit],
  );

  /** Send the last turn again, without repeating the user's message. */
  const retry = useCallback(() => {
    if (inFlight.current || !failed.current || !lastRequest.current) return;
    inFlight.current = true;
    failed.current = false;
    setFailure(null);
    mutate(lastRequest.current);
  }, [mutate]);

  return { sessionId, entries, pending: isPending, failure, send, sendAction, retry };
}
