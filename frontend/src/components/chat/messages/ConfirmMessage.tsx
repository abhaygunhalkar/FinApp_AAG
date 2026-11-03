import type { ChatAction, ConfirmMessage as Confirm } from '../../../types';
import { bubble } from './styles';

/** Asked before the bot changes anything; Yes and No send their actions. */
export default function ConfirmMessage({
  message,
  disabled,
  onAction,
}: {
  message: Confirm;
  disabled: boolean;
  onAction: (action: ChatAction, label: string) => void;
}) {
  return (
    <div className={`${bubble} space-y-2.5`}>
      <p>{message.prompt}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction(message.confirmAction, 'Yes')}
          className="min-h-9 rounded-lg bg-[#1D4ED8] px-4 text-sm font-semibold text-white hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] disabled:opacity-50"
        >
          Yes
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction(message.cancelAction, 'No')}
          className="min-h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          No
        </button>
      </div>
    </div>
  );
}
