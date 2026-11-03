import type { BotMessage } from '../../../types';
import type { ChatHandlers } from '../types';
import ConfirmMessage from './ConfirmMessage';
import ErrorNote from './ErrorNote';
import LinkMessage from './LinkMessage';
import MiniChart from './MiniChart';
import QuickReplies from './QuickReplies';
import StatCard from './StatCard';
import TextMessage from './TextMessage';
import TransactionTable from './TransactionTable';
import { bubble } from './styles';

interface Props {
  message: BotMessage;
  hidden: boolean;
  /** False for earlier turns: their buttons no longer act. */
  interactive: boolean;
  handlers: ChatHandlers;
}

/** One bot message, drawn by the component for its type. */
export default function MessageRenderer({ message, hidden, interactive, handlers }: Props) {
  switch (message.type) {
    case 'text':
      return <TextMessage message={message} />;
    case 'stat':
      return <StatCard message={message} hidden={hidden} />;
    case 'table':
      return <TransactionTable message={message} hidden={hidden} />;
    case 'chart':
      return <MiniChart message={message} hidden={hidden} />;
    case 'quickReplies':
      return interactive ? <QuickReplies message={message} onAction={handlers.onAction} /> : null;
    case 'link':
      return <LinkMessage message={message} onNavigate={handlers.onNavigate} />;
    case 'confirm':
      return (
        <ConfirmMessage message={message} disabled={!interactive} onAction={handlers.onAction} />
      );
    case 'error':
      return <ErrorNote>{message.message}</ErrorNote>;
    default:
      // A type this version of the app doesn't know (production skips the
      // contract check): say so instead of drawing something wrong.
      return <p className={`${bubble} italic`}>This part of the answer can't be shown here.</p>;
  }
}
