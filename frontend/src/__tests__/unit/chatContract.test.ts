import { describe, expect, it } from 'vitest';
import {
  ChatRequestSchema,
  ChatResponseSchema,
  StatMessageSchema,
  TableMessageSchema,
  parseChatResponse,
  safeParseChatResponse,
} from '../../types/chat';
// Shared with the backend's Pydantic tests, so both sides agree.
import examplesJson from '../../../../docs/chat-contract.examples.json';

interface Case {
  why: string;
  value: unknown;
}
const examples = examplesJson as unknown as {
  valid: { requests: unknown[]; responses: { messages: { type: string }[] }[] };
  invalid: { requests: Case[]; responses: Case[] };
};

describe('chat contract: shared examples', () => {
  it.each(examples.valid.requests)('accepts request %#', (payload) => {
    expect(ChatRequestSchema.parse(payload)).toEqual(payload);
  });

  it.each(examples.valid.responses)('accepts response %#', (payload) => {
    expect(parseChatResponse(payload)).toEqual(payload);
  });

  it.each(examples.invalid.requests)('rejects request: $why', ({ value }) => {
    expect(ChatRequestSchema.safeParse(value).success).toBe(false);
  });

  it.each(examples.invalid.responses)('rejects response: $why', ({ value }) => {
    expect(safeParseChatResponse(value).success).toBe(false);
  });

  it('has a valid example of every message type', () => {
    const seen = new Set(examples.valid.responses.flatMap((r) => r.messages.map((m) => m.type)));
    expect([...seen].sort()).toEqual(
      ['chart', 'confirm', 'error', 'link', 'quickReplies', 'stat', 'table', 'text'].sort(),
    );
  });
});

describe('chat contract: rules', () => {
  it('trims the message, then limits it to 2000 characters', () => {
    expect(ChatRequestSchema.parse({ sessionId: 's', message: '  hi  ' }).message).toBe('hi');
    expect(
      ChatRequestSchema.safeParse({ sessionId: 's', message: ` ${'x'.repeat(2000)} ` }).success,
    ).toBe(true);
    expect(ChatRequestSchema.safeParse({ sessionId: 's', message: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });

  it('defaults a stat to USD', () => {
    expect(StatMessageSchema.parse({ type: 'stat', label: 'Cash', value: 5 }).currency).toBe('USD');
  });

  it('names the table row that does not match the columns', () => {
    const result = TableMessageSchema.safeParse({
      type: 'table',
      columns: ['A', 'B'],
      rows: [[1, 2], [3]],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('row 1 has 1 cells; expected 2');
  });

  it('narrows messages by type', () => {
    const [first] = ChatResponseSchema.parse({
      sessionId: 's',
      messages: [{ type: 'link', label: 'Open', route: '/net-worth' }],
    }).messages;
    // Compiles only because the union narrows on `type`.
    expect(first.type === 'link' ? first.route : null).toBe('/net-worth');
  });
});
