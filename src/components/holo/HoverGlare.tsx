/**
 * Table cards (hand, board): the cheap Common-tier Grease Glare, one layer,
 * mounted only while the card is hovered or focused. Nothing runs at rest:
 * the tilt spring parks itself, and the layer is not in the DOM.
 */
import React, { useRef, useState } from 'react';
import { HoloLayer } from './HoloLayer';
import { useHoloTilt } from './useHoloTilt';
import { useReducedMotion } from '../../meta/useMotionMode';

export function HoverGlare({
  children,
  className = 'relative shrink-0',
}: {
  key?: React.Key;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const reduced = useReducedMotion();
  // maxTilt 0: the card itself never rotates on the table, only the light moves.
  const holo = useHoloTilt(ref, { maxTilt: 0, reduced, interactive: on });
  return (
    <div
      ref={ref}
      className={className}
      data-hover-glare={on ? '1' : undefined}
      onPointerEnter={() => setOn(true)}
      onPointerLeave={() => setOn(false)}
      onFocus={() => {
        setOn(true);
        holo.current?.set({ act: 0.6 });
      }}
      onBlur={() => setOn(false)}
    >
      {children}
      {on && <HoloLayer tier="common" />}
    </div>
  );
}
