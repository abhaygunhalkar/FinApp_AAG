import type { ReactElement } from 'react';
import { useActivity } from '../../hooks/useDashboard';
import { LoadingSpinner } from '../shared';
import type { ActivityEvent } from '../../types';

function getEventIcon(eventType: ActivityEvent['event_type']): ReactElement {
  switch (eventType) {
    case 'holding_added':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
        </svg>
      );
    case 'stock_sold':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
      );
    case 'watchlist_added':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
      );
    case 'watchlist_removed':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
          <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
        </svg>
      );
    case 'notes_updated':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      );
  }
}

function getEventDescription(event: ActivityEvent): string {
  const { event_type, ticker, details } = event;

  switch (event_type) {
    case 'holding_added':
      return `Added ${details.quantity} shares of ${ticker} at $${details.buy_price}`;
    case 'stock_sold':
      return `Sold ${details.quantity} shares of ${ticker} at $${details.sell_price} (gain: $${details.realized_gain})`;
    case 'watchlist_added':
      return `Added ${ticker} to watchlist`;
    case 'watchlist_removed':
      return `Removed ${ticker} from watchlist`;
    case 'notes_updated':
      return `Updated notes for ${ticker}`;
  }
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function ActivityFeed() {
  const { data: events, isLoading, isError } = useActivity();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Activity</h2>
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Activity</h2>
        <p className="text-sm text-red-500 dark:text-red-400">Failed to load activity feed.</p>
      </div>
    );
  }

  const activityEvents = (events ?? []).slice(0, 20);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Activity</h2>

      {activityEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
        </div>
      ) : (
        <ul className="space-y-3" role="list">
          {activityEvents.map((event, index) => (
            <li
              key={`${event.event_type}-${event.ticker}-${event.timestamp}-${index}`}
              className="flex items-start gap-3 rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="mt-0.5 flex-shrink-0">
                {getEventIcon(event.event_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-medium">{event.ticker}</span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                  {getEventDescription(event)}
                </p>
              </div>
              <time className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {formatTimestamp(event.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
