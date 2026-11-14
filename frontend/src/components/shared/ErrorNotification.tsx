import { useEffect, useState } from 'react';

interface ErrorNotificationProps {
  message: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export default function ErrorNotification({
  message,
  onDismiss,
  autoDismissMs = 5000,
}: ErrorNotificationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed top-4 right-4 z-50 flex items-start gap-3 max-w-sm w-full p-4 rounded-lg shadow-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800"
    >
      <div className="flex-shrink-0 text-red-500 dark:text-red-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <p className="flex-1 text-sm font-medium text-red-800 dark:text-red-200">{message}</p>
      <button
        onClick={() => {
          setVisible(false);
          onDismiss();
        }}
        className="flex-shrink-0 text-red-400 dark:text-red-300 hover:text-red-600 dark:hover:text-red-100 transition-colors"
        aria-label="Dismiss notification"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
