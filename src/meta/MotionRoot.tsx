/**
 * The App-root `<MotionConfig>`, in its own lazily loaded module.
 *
 * Importing `motion/react` from App.tsx put the whole motion library (~41 kB
 * gzip) into the eager bundle and over the size budget. Every screen that
 * animates is itself a lazy chunk, so loading this wrapper with them costs
 * nothing: it is in place before anything that could animate renders.
 */
import React from 'react';
import { MotionConfig } from 'motion/react';
import type { MotionMode } from './matchPrefs';

export default function MotionRoot({
  mode,
  children,
}: {
  mode: MotionMode;
  children: React.ReactNode;
}) {
  return (
    <MotionConfig
      reducedMotion={mode === 'reduced' ? 'always' : mode === 'full' ? 'never' : 'user'}
    >
      {children}
    </MotionConfig>
  );
}
