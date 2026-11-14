import { useState, type FormEvent } from 'react';
import { useChangePassword } from '../../hooks/useAuth';

const INPUT =
  'mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-gray-300';
const MIN_LENGTH = 12;

const EMPTY = { current: '', next: '', confirm: '', code: '' };

/** "Change password" in Settings: current password, a code with two-step on, and the new one twice. */
export default function ChangePasswordForm({ twoStep }: { twoStep: boolean }) {
  const change = useChangePassword();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(EMPTY);
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  function close() {
    setOpen(false);
    setFields(EMPTY);
    setMismatch(false);
    change.reset();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (change.isPending) return;
    if (fields.next !== fields.confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate(
      {
        current_password: fields.current,
        new_password: fields.next,
        ...(twoStep ? { code: fields.code.trim() } : {}),
      },
      {
        onSuccess: ({ signed_out }) => {
          close();
          setDone(
            signed_out > 0
              ? `Password changed. ${signed_out} other ${signed_out === 1 ? 'browser was' : 'browsers were'} signed out.`
              : 'Password changed.',
          );
        },
        // Wrong guesses count toward the lockout, so clear what was wrong.
        onError: () => setFields((prev) => ({ ...prev, current: '', code: '' })),
      },
    );
  }

  if (!open) {
    return (
      <div className="mt-4">
        {done && (
          <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">
            {done}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          Change password
        </button>
      </div>
    );
  }

  const ready =
    fields.current &&
    fields.next.length >= MIN_LENGTH &&
    fields.confirm &&
    (!twoStep || fields.code.trim());

  return (
    <form onSubmit={submit} className="mt-4 max-w-sm space-y-3" noValidate>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Change password</h3>
      {(change.error || mismatch) && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {mismatch ? "The new passwords don't match." : change.error?.message}
        </p>
      )}
      <label className={LABEL}>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={fields.current}
          onChange={(e) => set('current')(e.target.value)}
          className={INPUT}
        />
      </label>
      <label className={LABEL}>
        New password
        <input
          type="password"
          autoComplete="new-password"
          value={fields.next}
          onChange={(e) => set('next')(e.target.value)}
          aria-describedby="new-password-rules"
          className={INPUT}
        />
      </label>
      <p id="new-password-rules" className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
        At least {MIN_LENGTH} characters, not containing your username.
      </p>
      <label className={LABEL}>
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          value={fields.confirm}
          onChange={(e) => set('confirm')(e.target.value)}
          className={INPUT}
        />
      </label>
      {twoStep && (
        <label className={LABEL}>
          Authenticator code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456 or a backup code"
            value={fields.code}
            onChange={(e) => set('code')(e.target.value)}
            className={INPUT}
          />
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!ready || change.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {change.isPending ? 'Saving…' : 'Change password'}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
