import type { BotMessage, ChatAction } from '../../types';

/** The starter chips; their action types are the engine's intent names. */
export const STARTER_ACTIONS: { label: string; action: ChatAction }[] = [
  { label: 'Net worth', action: { type: 'netWorth' } },
  { label: 'Account balances', action: { type: 'balances' } },
  { label: 'Bills due this week', action: { type: 'upcomingBills' } },
];

/**
 * Placeholder replies until the widget calls POST /api/chat. They say so
 * plainly rather than inventing numbers.
 */
export function mockReply(): BotMessage[] {
  return [
    {
      type: 'text',
      text: "I'm not connected yet, so I can't look that up. This is a preview of the assistant.",
    },
    { type: 'quickReplies', options: STARTER_ACTIONS },
  ];
}
