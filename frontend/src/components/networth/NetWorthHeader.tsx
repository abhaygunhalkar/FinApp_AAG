import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type AddAction = 'connect' | 'manual' | 'property' | 'vehicle' | 'crypto';

interface NetWorthHeaderProps {
  subtitle: string;
  hidden: boolean;
  onToggleHidden: () => void;
  onAdd: (action: AddAction) => void;
  connectBusy: boolean;
}

export default function NetWorthHeader({
  subtitle,
  hidden,
  onToggleHidden,
  onAdd,
  connectBusy,
}: NetWorthHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900 dark:text-white">
          Net worth
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleHidden}
          aria-pressed={hidden}
          aria-label={hidden ? 'Show balances' : 'Hide balances'}
          title={hidden ? 'Show balances' : 'Hide balances'}
          className="h-11 w-11 flex items-center justify-center rounded-full border border-[#E4E7EC] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <AddMenu onAdd={onAdd} connectBusy={connectBusy} />
      </div>
    </header>
  );
}

const MENU_ITEMS: { action: AddAction; label: string; hint: string; icon: ReactNode }[] = [
  {
    action: 'connect',
    label: 'Connect bank',
    hint: 'Sync balances automatically',
    icon: <BankIcon />,
  },
  {
    action: 'manual',
    label: 'Manual account',
    hint: 'Cash, card, loan or other',
    icon: <PencilIcon />,
  },
  { action: 'property', label: 'Property', hint: 'Home or real estate value', icon: <HomeIcon /> },
  { action: 'vehicle', label: 'Vehicle', hint: 'Car, motorcycle or boat', icon: <CarIcon /> },
  { action: 'crypto', label: 'Crypto', hint: 'Wallet or exchange balance', icon: <CoinIcon /> },
];

function AddMenu({ onAdd, connectBusy }: { onAdd: (a: AddAction) => void; connectBusy: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-11 px-4 inline-flex items-center gap-1.5 rounded-full bg-[#0C1322] dark:bg-white text-white dark:text-[#0C1322] text-sm font-semibold hover:bg-[#1F2A3F] dark:hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
        </svg>
        Add
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Add to net worth"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[#E4E7EC] dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shadow-[0_16px_40px_-12px_rgba(12,19,34,0.25)]"
        >
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.action}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              disabled={item.action === 'connect' && connectBusy}
              onClick={() => {
                setOpen(false);
                onAdd(item.action);
              }}
              className="w-full min-h-11 flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/60 focus:bg-slate-50 dark:focus:bg-slate-700/60 focus:outline-none disabled:opacity-50"
            >
              <span className="h-9 w-9 shrink-0 rounded-lg bg-[#F4F5F7] dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                {item.icon}
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {item.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-[18px] w-[18px]',
  'aria-hidden': true,
};

function EyeIcon() {
  return (
    <svg {...iconProps} className="h-5 w-5">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...iconProps} className="h-5 w-5">
      <path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6.6 6.7C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function BankIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
    </svg>
  );
}

export function CardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  );
}

export function LoanIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4M10 12.5h5M10 16h5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="m3 10.5 9-7 9 7M5 9v10.5h5V14h4v5.5h5V9" />
    </svg>
  );
}

function CarIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 16.5h14M5 16.5V12l2-5h10l2 5v4.5M5 16.5V19M19 16.5V19M4 12h16" />
      <circle cx="8" cy="14" r=".6" fill="currentColor" />
      <circle cx="16" cy="14" r=".6" fill="currentColor" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8h3.5a2 2 0 0 1 0 4H10m0 0h4a2 2 0 0 1 0 4h-4m0-8v8m1.5-9.5v1.5m0 8v1.5" />
    </svg>
  );
}
