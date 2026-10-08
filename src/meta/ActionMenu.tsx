import React, { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export interface ActionMenuItem {
  id: string;
  label: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Second line under the label (e.g. what a command does). */
  hint?: string;
}

/**
 * A button that opens a small menu of commands. Used where a toolbar has more
 * actions than a phone has width for: the rarely-used ones move behind one
 * trigger instead of wrapping into extra rows.
 *
 * Closes on selection, outside press, and Escape (focus returns to the
 * trigger). Items are 44px tall so they are thumb-sized.
 */
export function ActionMenu({
  label,
  ariaLabel,
  items,
  className,
  buttonClassName,
}: {
  label: React.ReactNode;
  ariaLabel: string;
  items: ActionMenuItem[];
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
      // The menu consumed this Escape; screens that close on Escape must not
      // also fire.
      e.stopPropagation();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'btn-pop heading-font fs-sm px-3 py-2 min-h-[36px] min-w-[36px] ink-border-sm shadow-hard-black-xs bg-[var(--c-steel)] text-[var(--c-paper)] flex items-center justify-center gap-1',
          buttonClassName,
        )}
      >
        {label}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] max-w-[80vw] bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black-sm flex flex-col"
        >
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className="text-left px-3 py-2 min-h-[44px] fs-sm font-bold hover:bg-[var(--c-yellow)] focus-visible:bg-[var(--c-yellow)] disabled:opacity-40 disabled:cursor-not-allowed border-b-2 border-[var(--c-ink)]/15 last:border-b-0"
            >
              <span className="heading-font fs-sm block">{it.label}</span>
              {it.hint && <span className="fs-xs text-[var(--c-steel)] block">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
