/**
 * LiveHolo — a self-driving HoloLayer: it binds useHoloTilt to whatever
 * element it is mounted in, so a caller whose card element is re-created
 * (the pack reveal keys each card) just mounts and unmounts it.
 *
 * On mount the light ramps from 0 to `act` with the spring (≈ a card flip),
 * and `sweepAfterMs` (when set) runs one automatic pass of light.
 */
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { HoloLayer, type HoloFinish, type HoloTier } from './HoloLayer';
import { useHoloTilt } from './useHoloTilt';

export function LiveHolo({
  tier,
  finish = null,
  colour,
  reduced = false,
  act = 1,
  sweepAfterMs,
}: {
  key?: React.Key;
  tier: HoloTier;
  finish?: HoloFinish;
  colour?: string | null;
  reduced?: boolean;
  act?: number;
  sweepAfterMs?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const host = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    host.current = anchor.current?.parentElement ?? null;
  }, []);
  const holo = useHoloTilt(host, { reduced });
  useEffect(() => {
    if (reduced) return;
    holo.current?.set({ px: 0.5, py: 0.5, act: 0 }, true);
    holo.current?.set({ act });
    if (sweepAfterMs === undefined) return;
    const t = window.setTimeout(() => holo.current?.sweep(), sweepAfterMs);
    return () => window.clearTimeout(t);
  }, [holo, reduced, act, sweepAfterMs]);
  return (
    <>
      <span ref={anchor} hidden />
      <HoloLayer tier={tier} finish={finish} colour={colour} />
    </>
  );
}
