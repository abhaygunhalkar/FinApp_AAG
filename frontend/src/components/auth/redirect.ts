/** Where to go after signing in: an in-app path only, never another site. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/login')) return '/';
  return next;
}

/** The sign-in page URL that comes back to `path` afterwards. */
export function loginUrl(path: string, expired = false): string {
  const params = new URLSearchParams();
  if (expired) params.set('expired', '1');
  if (path && path !== '/') params.set('next', path);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
