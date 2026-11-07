import { Link } from 'react-router-dom';
import type { LinkMessage as LinkMsg } from '../../../types';

/** A page in the app, opened with the router (never an external URL). */
export default function LinkMessage({
  message,
  onNavigate,
}: {
  message: LinkMsg;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={message.route}
      onClick={onNavigate}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg text-sm font-semibold text-accent-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700 dark:text-blue-300"
    >
      {message.label}
      <span aria-hidden="true">→</span>
    </Link>
  );
}
