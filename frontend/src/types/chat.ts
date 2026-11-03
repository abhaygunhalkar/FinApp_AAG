import { z } from 'zod';

/*
 * Chat assistant contract: what the widget sends and what the bot replies.
 *
 * Mirrors backend/app/schemas/chat.py (Pydantic). Change both together, and the
 * shared examples in docs/chat-contract.examples.json. See docs/chat-contract.md.
 * Unknown fields are rejected, so a typo on either side fails the tests.
 */

/** What a quick reply or confirm button sends back to the bot. */
export const ChatActionSchema = z.strictObject({
  type: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/** One turn from the user: typed text, or a clicked action. Never both. */
export const ChatRequestSchema = z
  .strictObject({
    sessionId: z.string().min(1).max(100),
    // Trimmed first, then checked, as the backend does.
    message: z.string().trim().min(1).max(2000).optional(),
    action: ChatActionSchema.optional(),
  })
  .refine((r) => (r.message === undefined) !== (r.action === undefined), {
    message: 'send either a message or an action',
  });

export const TextMessageSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
});

/** One headline number, e.g. "Net worth $330,827 ▲ $1,200". */
export const StatMessageSchema = z.strictObject({
  type: z.literal('stat'),
  label: z.string().min(1),
  value: z.number(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  delta: z.number().optional(),
});

const CellSchema = z.union([z.string(), z.number(), z.null()]);

export const TableMessageSchema = z
  .strictObject({
    type: z.literal('table'),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(CellSchema)),
  })
  .superRefine((t, ctx) => {
    t.rows.forEach((row, i) => {
      if (row.length !== t.columns.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', i],
          message: `row ${i} has ${row.length} cells; expected ${t.columns.length}`,
        });
      }
    });
  });

export const ChartSeriesSchema = z.strictObject({
  name: z.string(),
  points: z.array(z.strictObject({ label: z.string(), value: z.number() })),
});

export const ChartMessageSchema = z
  .strictObject({
    type: z.literal('chart'),
    kind: z.enum(['bar', 'pie', 'line']),
    series: z.array(ChartSeriesSchema).min(1),
  })
  .refine((c) => c.kind !== 'pie' || c.series.length === 1, {
    message: 'a pie chart has exactly one series',
    path: ['series'],
  });

export const QuickRepliesMessageSchema = z.strictObject({
  type: z.literal('quickReplies'),
  options: z
    .array(z.strictObject({ label: z.string().min(1), action: ChatActionSchema }))
    .min(1)
    .max(6),
});

/** A link to a page in the app; never an external URL. */
export const LinkMessageSchema = z.strictObject({
  type: z.literal('link'),
  label: z.string().min(1),
  route: z.string().regex(/^\/([^/].*)?$/),
});

/** Asked before the bot changes anything. */
export const ConfirmMessageSchema = z.strictObject({
  type: z.literal('confirm'),
  prompt: z.string().min(1),
  confirmAction: ChatActionSchema,
  cancelAction: ChatActionSchema,
});

export const ErrorMessageSchema = z.strictObject({
  type: z.literal('error'),
  message: z.string().min(1),
  code: z.string().optional(),
});

export const BotMessageSchema = z.discriminatedUnion('type', [
  TextMessageSchema,
  StatMessageSchema,
  TableMessageSchema,
  ChartMessageSchema,
  QuickRepliesMessageSchema,
  LinkMessageSchema,
  ConfirmMessageSchema,
  ErrorMessageSchema,
]);

/** The bot's reply to one turn: one or more messages, in order. */
export const ChatResponseSchema = z.strictObject({
  sessionId: z.string().min(1).max(100),
  messages: z.array(BotMessageSchema),
});

export type ChatAction = z.infer<typeof ChatActionSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type BotMessage = z.infer<typeof BotMessageSchema>;
export type TextMessage = z.infer<typeof TextMessageSchema>;
export type StatMessage = z.infer<typeof StatMessageSchema>;
export type TableMessage = z.infer<typeof TableMessageSchema>;
export type ChartMessage = z.infer<typeof ChartMessageSchema>;
export type QuickRepliesMessage = z.infer<typeof QuickRepliesMessageSchema>;
export type LinkMessage = z.infer<typeof LinkMessageSchema>;
export type ConfirmMessage = z.infer<typeof ConfirmMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

/** Validate a reply from the API; throws a ZodError when it doesn't match. */
export function parseChatResponse(data: unknown): ChatResponse {
  return ChatResponseSchema.parse(data);
}

/** Validate a reply from the API without throwing. */
export function safeParseChatResponse(data: unknown) {
  return ChatResponseSchema.safeParse(data);
}
