import { isAxiosError } from 'axios';
import apiClient, { unwrapResponse } from './client';
import type { ApiResponse, BotMessage, ChatRequest, ChatResponse } from '../types';

/** The engine has its own 10s limit; allow for the round trip. */
const TIMEOUT_MS = 15000;

// Server statuses worth trying again: busy, broken, or too slow.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class ChatApiError extends Error {
  /** HTTP status, or null when the server wasn't reached. */
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

/** The error message the server put in a failed reply, if any. */
function serverMessage(body: unknown): string | null {
  const messages = (body as { data?: { messages?: BotMessage[] } } | null)?.data?.messages;
  const error = messages?.find((m) => m.type === 'error');
  return error && error.type === 'error' ? error.message : null;
}

/** In development, check every reply against the shared contract. */
async function checkInDev(response: ChatResponse): Promise<void> {
  if (!import.meta.env.DEV) return;
  // Loaded only in development, so Zod stays out of the production bundle.
  const { safeParseChatResponse } = await import('../types/chat');
  const result = safeParseChatResponse(response);
  if (!result.success) {
    console.error('Chat reply does not match the contract', result.error.issues);
    throw new ChatApiError("The assistant sent a reply this app can't read.", null, false);
  }
}

/** POST /api/chat. Throws ChatApiError with a message fit to show the user. */
export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  let response: ChatResponse;
  try {
    const { data } = await apiClient.post<ApiResponse<ChatResponse>>('/api/chat', request, {
      timeout: TIMEOUT_MS,
    });
    response = unwrapResponse(data);
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      const status = err.response.status;
      throw new ChatApiError(
        serverMessage(err.response.data) ?? 'The assistant ran into a problem.',
        status,
        RETRYABLE.has(status),
      );
    }
    throw new ChatApiError(
      "Couldn't reach the assistant. Check your connection and try again.",
      null,
      true,
    );
  }
  await checkInDev(response);
  return response;
}
