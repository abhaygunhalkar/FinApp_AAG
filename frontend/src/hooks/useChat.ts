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

function saveSessionId(id: string): string {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // Storage blocked (privacy mode, sandbox): the id lasts for this page only.
  }
  return id;
}

/** This tab's conversation id; kept in sessionStorage when it's available. */
function loadSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
  } catch {
    // As above.
  }
  return saveSessionId(newSessionId());
}

/** One turn as sent, tagged with the conversation it belongs to. */
interface Turn {
  request: ChatRequest;
  conversation: number;
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
  const [sessionId, setSessionId] = useState(loadSessionId);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const nextId = useRef(0);
  const onReplyRef = useRef(onReply);
  // Set the moment a turn is sent, so a double click can't send it twice
  // before React re-renders with isPending.
  const inFlight = useRef(false);
  // Only a turn that failed can be retried.
  const failed = useRef(false);
  // Bumped by reset(), so a reply still on its way from the old conversation
  // is dropped instead of landing in the new one.
  const conversation = useRef(0);
  const lastTurn = useRef<Turn | null>(null);

  useEffect(() => {
    onReplyRef.current = onReply;
  }, [onReply]);

  const mutation = useMutation({
    mutationFn: (turn: Turn) => sendChat(turn.request),
    // Never resend automatically: a repeated action could act twice.
    retry: false,
    onSettled: (_data, _err, turn) => {
      if (turn.conversation === conversation.current) inFlight.current = false;
    },
    onSuccess: (response, turn) => {
      if (turn.conversation !== conversation.current) return;
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
    onError: (err, turn) => {
      if (turn.conversation !== conversation.current) return;
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
      const sent: Turn = {
        request: { sessionId, ...turn },
        conversation: conversation.current,
      };
      lastTurn.current = sent;
      mutate(sent);
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
    if (inFlight.current || !failed.current || !lastTurn.current) return;
    inFlight.current = true;
    failed.current = false;
    setFailure(null);
    mutate(lastTurn.current);
  }, [mutate]);

  /** Start over: clear the messages and use a new session id. */
  const { reset: resetMutation } = mutation;
  const reset = useCallback(() => {
    conversation.current += 1;
    inFlight.current = false;
    failed.current = false;
    lastTurn.current = null;
    resetMutation();
    setEntries([]);
    setFailure(null);
    setSessionId(saveSessionId(newSessionId()));
  }, [resetMutation]);

  return { sessionId, entries, pending: isPending, failure, send, sendAction, retry, reset };
}
