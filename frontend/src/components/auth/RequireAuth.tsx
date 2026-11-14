import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isUnauthorized } from '../../api/client';
import { useMe } from '../../hooks/useAuth';
import { LoadingSpinner } from '../shared';
import { loginUrl } from './redirect';

/** Shows its routes only to a signed-in user; everyone else goes to /login. */
export default function RequireAuth() {
  const { isPending, error, refetch, isFetching } = useMe();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-60 dark:bg-slate-900">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    if (isUnauthorized(error)) {
      return <Navigate to={loginUrl(location.pathname + location.search)} replace />;
    }
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-ink-60 px-4 text-center dark:bg-slate-900">
        <p role="alert" className="text-sm text-slate-700 dark:text-slate-300">
          Couldn&apos;t reach the server. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex h-10 items-center rounded-full bg-ink-900 px-5 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
        >
          {isFetching ? 'Trying…' : 'Try again'}
        </button>
      </div>
    );
  }

  return <Outlet />;
}
