import React from 'react';
import { cn } from '../lib/utils';

/** A filter dropdown with its name printed above it, so a row of selects that
 * all open on "All" are still told apart without opening them. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-0.5 min-w-0', className)}>
      <span className="fs-xs font-black uppercase tracking-wide text-[var(--c-steel)]">
        {label}
      </span>
      <select
        className="px-2 py-1.5 min-h-[36px] w-full bg-[var(--c-paper)] ink-border-sm font-bold text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
