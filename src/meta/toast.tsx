import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * A small toast host any screen can use: `const { toast } = useToast()`.
 * Toasts are dismissible, auto-expire, announce politely to screen readers and
 * only animate when motion is allowed. Outside a provider (tests, the preview
 * harness) `toast` is a no-op, so callers never have to guard it.
 */
export type ToastKind = 'info' | 'gain' | 'loss';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface ToastApi {
  toast: (message: string, opts?: { kind?: ToastKind; ms?: number }) => void;
}

const NOOP: ToastApi = { toast: () => undefined };
const ToastContext = createContext<ToastApi>(NOOP);
export const useToast = (): ToastApi => useContext(ToastContext);

const MAX_VISIBLE = 3;
const DEFAULT_MS = 4500;

const KIND_CLASS: Record<ToastKind, string> = {
  info: 'bg-[var(--c-paper)] text-[var(--c-ink)]',
  gain: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
  loss: 'bg-[var(--c-ink)] text-[var(--c-paper)]',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    (message, opts) => {
      const id = nextId.current++;
      setItems((cur) => [...cur, { id, message, kind: opts?.kind ?? 'info' }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), opts?.ms ?? DEFAULT_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((t) => window.clearTimeout(t));
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The keyframes only run when motion is allowed: the same two gates the
          rest of the app uses (the OS setting, and the in-app Motion override). */}
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        .toast-item { animation: toast-in 160ms ease-out; }
        @media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) .toast-item { animation: none; } }
        html[data-motion='reduced'] .toast-item { animation: none; }
      `}</style>
      <div
        aria-label="Notifications"
        className="fixed z-[90] inset-x-0 top-14 flex flex-col items-center gap-2 px-4 pointer-events-none"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'toast-item pointer-events-auto flex items-center gap-2 ink-border-sm shadow-hard-black-xs pl-3 pr-1 py-1 max-w-[min(92vw,420px)] fs-sm font-bold',
              KIND_CLASS[t.kind],
            )}
          >
            <span className="min-w-0">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 w-7 h-7 flex items-center justify-center opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
