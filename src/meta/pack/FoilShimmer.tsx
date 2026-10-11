import React, { useRef, useState } from 'react';
import { usePointerVars } from './usePointerVars';

type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * Holographic shimmer over a foil card. The highlight follows the pointer
 * (mouse or finger) across the card; on phones it can follow device tilt
 * instead, behind the permission prompt iOS requires (a small TILT button,
 * shown only where that prompt exists). Static under reduced motion.
 */
export function FoilShimmer({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // iOS gates device orientation behind a permission prompt that must come
  // from a tap; elsewhere tilt events just arrive.
  const [tiltAsk, setTiltAsk] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof (window.DeviceOrientationEvent as unknown as OrientationCtor | undefined)
        ?.requestPermission === 'function',
  );

  usePointerVars(ref, 'parent', reducedMotion);

  const askTilt = (e: React.MouseEvent) => {
    e.stopPropagation();
    const DOE = window.DeviceOrientationEvent as unknown as OrientationCtor;
    DOE.requestPermission?.()
      .then((r) => {
        if (r !== 'granted') return;
        setTiltAsk(false);
        const el = ref.current;
        window.addEventListener('deviceorientation', (ev) => {
          if (!el || ev.gamma == null || ev.beta == null) return;
          el.style.setProperty(
            '--mx',
            `${Math.round(50 + Math.max(-50, Math.min(50, ev.gamma * 1.4)))}%`,
          );
          el.style.setProperty(
            '--my',
            `${Math.round(50 + Math.max(-50, Math.min(50, (ev.beta - 45) * 1.4)))}%`,
          );
        });
      })
      .catch(() => undefined);
  };

  return (
    <>
      <div
        ref={ref}
        aria-hidden
        className="po-foil-shimmer"
        data-static={reducedMotion || undefined}
      />
      {tiltAsk && !reducedMotion && (
        <button type="button" className="po-tilt-btn" onClick={askTilt}>
          TILT ✦
        </button>
      )}
    </>
  );
}
