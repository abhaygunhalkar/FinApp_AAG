import type { ChatAction, QuickRepliesMessage } from '../../../types';
import { chip } from './styles';

/** Suggested next questions; clicking one sends its action. */
export default function QuickReplies({
  message,
  onAction,
}: {
  message: QuickRepliesMessage;
  onAction: (action: ChatAction, label: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested replies">
      {message.options.map((o) => (
        <button
          key={o.label}
          type="button"
          className={chip}
          onClick={() => onAction(o.action, o.label)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
