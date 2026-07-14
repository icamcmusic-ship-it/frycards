import React from 'react';
import { PlayerRole } from '../lib/supabase';

/**
 * Role badge shown next to usernames everywhere a player is displayed.
 *  - Creator: the first account (Fry) — full access to everything.
 *  - Founder: one of the first 25 signups after the Creator.
 * Regular players get no badge.
 */
const ROLE_STYLES: Record<Exclude<PlayerRole, 'player'>, { label: string; bg: string; fg: string; title: string }> = {
  creator: {
    label: 'CREATOR',
    bg: 'linear-gradient(135deg, #ff5722, #ffc107)',
    fg: '#111',
    title: 'Creator — built FryCards. Full access to everything.',
  },
  founder: {
    label: 'FOUNDER',
    bg: 'linear-gradient(135deg, #7c4dff, #40c4ff)',
    fg: '#fff',
    title: 'Founder — one of the first 25 operatives to enlist.',
  },
};

export function RoleBadge({
  role,
  size = 'sm',
}: {
  role: PlayerRole | null | undefined;
  size?: 'sm' | 'md';
}) {
  if (!role || role === 'player') return null;
  const s = ROLE_STYLES[role];
  return (
    <span
      title={s.title}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        marginLeft: 6,
        padding: size === 'sm' ? '1px 6px' : '2px 9px',
        fontSize: size === 'sm' ? 9 : 11,
        fontWeight: 900,
        letterSpacing: '0.08em',
        borderRadius: 4,
        border: '2px solid #111',
        boxShadow: '2px 2px 0 #111',
        background: s.bg,
        color: s.fg,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {s.label}
    </span>
  );
}

export default RoleBadge;
