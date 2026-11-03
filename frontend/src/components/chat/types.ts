import type { BotMessage, ChatAction } from '../../types';

/** One line in the conversation: what the user sent, or one bot message. */
export type ChatEntry =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'bot'; message: BotMessage };

export type PanelState = 'closed' | 'open' | 'minimized';

export interface ChatHandlers {
  /** Typed text, or an example question that was clicked. */
  onSend: (text: string) => void;
  /** A quick reply or confirm button; `label` is what the user saw. */
  onAction: (action: ChatAction, label: string) => void;
  /** An in-app link was followed. */
  onNavigate: () => void;
}
