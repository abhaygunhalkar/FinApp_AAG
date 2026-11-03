import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { BotMessage } from '../../types';

export const CHAT_URL = 'http://localhost:8000/api/chat';

/** Every request body the mock server received, in order. */
export const received: unknown[] = [];

export const chatServer = setupServer();

/** Answer each request with these messages (echoing the sessionId). */
export function replyWith(messages: BotMessage[]) {
  chatServer.use(
    http.post(CHAT_URL, async ({ request }) => {
      const body = (await request.json()) as { sessionId: string };
      received.push(body);
      return HttpResponse.json({
        success: true,
        data: { sessionId: body.sessionId, messages },
        error: null,
      });
    }),
  );
}

/** Fail the next request the way the backend does: status plus an error message. */
export function failOnceWith(status: number, message: string, code = 'x') {
  chatServer.use(
    http.post(
      CHAT_URL,
      async ({ request }) => {
        received.push(await request.json());
        return HttpResponse.json(
          {
            success: false,
            data: { sessionId: 's', messages: [{ type: 'error', message, code }] },
            error: message,
          },
          { status },
        );
      },
      { once: true },
    ),
  );
}
