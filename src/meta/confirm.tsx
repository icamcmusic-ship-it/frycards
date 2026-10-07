/**
 * In-app confirm dialog (AUDIT-2026-10-06 §2.24), replacing `window.confirm`.
 *
 * `askConfirm(message)` returns a promise of the player's answer, so a call
 * site reads the same as before with `await` in front. `<ConfirmHost />` is
 * mounted once at the App root and renders whichever question is pending,
 * focus-trapped, Escape = cancel, Enter on the default button = confirm.
 * Without a host mounted (tests, preview pages) it falls back to the native
 * dialog so nothing silently auto-confirms.
 */
import React, { useEffect, useState } from 'react';
import { useEscapeClose, useFocusTrap } from '../components/useFocusTrap';

type Pending = { message: string; resolve: (ok: boolean) => void };
let show: ((p: Pending) => void) | null = null;

export function askConfirm(message: string): Promise<boolean> {
  if (!show) {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(message));
  }
  const open = show;
  return new Promise((resolve) => open({ message, resolve }));
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    show = (p) =>
      setPending((cur) => {
        // A second question while one is open: the first one is declined.
        cur?.resolve(false);
        return p;
      });
    return () => {
      show = null;
    };
  }, []);
  if (!pending) return null;
  const answer = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };
  return <ConfirmDialog message={pending.message} onAnswer={answer} />;
}

function ConfirmDialog({
  message,
  onAnswer,
}: {
  message: string;
  onAnswer: (ok: boolean) => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>();
  useEscapeClose(() => onAnswer(false));
  return (
    <div
      className="fixed inset-0 z-[80] bg-[var(--c-ink)]/80 flex items-center justify-center p-4"
      onClick={() => onAnswer(false)}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm"
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black-sm p-4 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold mb-4 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="btn-pop heading-font text-xs px-3 py-2 ink-border-sm bg-[var(--c-paper)]"
          >
            CANCEL
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onAnswer(true)}
            className="btn-pop heading-font text-xs px-3 py-2 ink-border-sm shadow-hard-black-xs bg-[var(--c-yellow)] text-[var(--c-ink)]"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
