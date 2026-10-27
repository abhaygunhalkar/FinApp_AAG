import type { Issuer } from './issuers';

/**
 * A square tile in the issuer's brand colour with its logo in white, or a
 * short wordmark when no logo is available.
 */
export default function IssuerBadge({
  issuer,
  className = 'h-8 w-8 rounded-lg',
}: {
  issuer: Issuer;
  /** Size and corner radius, e.g. "h-11 w-11 rounded-xl". */
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 flex items-center justify-center text-white ${className}`}
      style={{ background: issuer.color }}
      title={issuer.name}
      aria-hidden="true"
    >
      {issuer.path ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-[55%] w-[55%]">
          <path d={issuer.path} />
        </svg>
      ) : (
        <span className="text-[11px] font-bold tracking-tight">{issuer.text}</span>
      )}
    </span>
  );
}
