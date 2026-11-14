import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { safeNext } from '../components/auth';
import { EyeIcon, EyeOffIcon } from '../components/networth';
import { useLogin, useMe } from '../hooks/useAuth';

const INPUT =
  'mt-1.5 block h-11 w-full rounded-xl border border-ink-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3.5 text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30';
const PRIMARY =
  'mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-ink-900 px-5 text-[15px] font-semibold text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700';
const LINK =
  'text-sm font-medium text-accent-700 hover:underline dark:text-blue-300 focus-visible:outline-2 focus-visible:outline-accent-700 rounded';

/**
 * The app's sign-in page. There's no sign-up: the one account is made on the
 * server. With two-step sign-in on, a second step asks for an authenticator
 * or backup code.
 */
export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const expired = params.get('expired') === '1';

  const me = useMe();
  const signIn = useLogin();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);

  if (me.data) return <Navigate to={next} replace />;

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (signIn.isPending) return;
    signIn.mutate(
      { username: username.trim(), password },
      {
        onSuccess: (result) => {
          if (result.code_required) {
            signIn.reset();
            setStep('code');
          } else {
            navigate(next, { replace: true });
          }
        },
        onError: () => setPassword(''),
      },
    );
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (signIn.isPending) return;
    signIn.mutate(
      { username: username.trim(), password, code: code.trim() },
      {
        onSuccess: () => navigate(next, { replace: true }),
        onError: () => setCode(''),
      },
    );
  }

  function backToPassword() {
    signIn.reset();
    setStep('password');
    setPassword('');
    setCode('');
    setUseBackup(false);
  }

  function trackCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  }

  const codeReady = useBackup ? code.trim().length >= 8 : /^\d{6}$/.test(code.trim());

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-ink-60 dark:bg-slate-900 px-4 py-10"
      style={{
        fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-finance-gradient text-sky-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path
                fillRule="evenodd"
                d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <span className="text-xl font-bold tracking-[-0.01em] text-slate-900 dark:text-white">
            FINAPP_AAG
          </span>
        </div>

        <section className="rounded-[20px] border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-7 sm:px-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
            {step === 'password' ? 'Sign in' : 'Two-step verification'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {step === 'password'
              ? 'Welcome back. Sign in to see your finances.'
              : useBackup
                ? 'Enter one of your backup codes. Each one works only once.'
                : 'Enter the 6-digit code from your authenticator app.'}
          </p>

          {step === 'password' && expired && !signIn.error && (
            <p
              role="status"
              className="mt-5 rounded-xl bg-accent-200/40 px-3.5 py-2.5 text-sm text-accent-800 dark:bg-accent-500/15 dark:text-blue-200"
            >
              Your session ended. Please sign in again.
            </p>
          )}
          {signIn.error && (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300"
            >
              {signIn.error.message}
            </p>
          )}

          {step === 'password' ? (
            <form onSubmit={submitPassword} className="mt-5 space-y-4" noValidate>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Username
                <input
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={INPUT}
                />
              </label>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={trackCapsLock}
                    onKeyDown={trackCapsLock}
                    aria-describedby={capsLock ? 'caps-lock' : undefined}
                    className={`${INPUT} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 mt-[3px] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-accent-700"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {capsLock && (
                  <p
                    id="caps-lock"
                    className="mt-1.5 text-[13px] text-amber-700 dark:text-amber-300"
                  >
                    Caps Lock is on.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={signIn.isPending || !username.trim() || !password}
                className={PRIMARY}
              >
                {signIn.isPending ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="mt-5 space-y-4" noValidate>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                {useBackup ? 'Backup code' : 'Code'}
                <input
                  key={useBackup ? 'backup' : 'code'}
                  name="code"
                  type="text"
                  inputMode={useBackup ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  maxLength={useBackup ? 11 : 6}
                  placeholder={useBackup ? 'xxxx-xxxx' : '123456'}
                  value={code}
                  onChange={(e) =>
                    setCode(useBackup ? e.target.value : e.target.value.replace(/\D/g, ''))
                  }
                  className={`${INPUT} tracking-[0.3em] tabular-nums`}
                />
              </label>

              <button type="submit" disabled={signIn.isPending || !codeReady} className={PRIMARY}>
                {signIn.isPending ? 'Checking…' : 'Verify'}
              </button>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button type="button" onClick={backToPassword} className={LINK}>
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseBackup((v) => !v);
                    setCode('');
                    signIn.reset();
                  }}
                  className={LINK}
                >
                  {useBackup ? 'Use authenticator code' : 'Use a backup code'}
                </button>
              </div>
            </form>
          )}
        </section>

        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Private app. Access is limited to its owner.
        </p>
      </div>
    </main>
  );
}
