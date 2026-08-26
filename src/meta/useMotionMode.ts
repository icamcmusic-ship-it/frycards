import { useCallback, useEffect, useState } from 'react';
import { MotionMode, loadMotionMode, saveMotionMode, motionIsReduced } from './matchPrefs';

/**
 * The app's motion preference, plus the `<html data-motion>` attribute the CSS
 * override keys off (see index.css). The JS half — telling the motion library
 * to honour it — is a `<MotionConfig>` at the App root; see `App.tsx`.
 *
 * Resolves 'system' live: a player who flips the OS setting mid-session gets
 * the change without a reload, which is the behaviour `reducedMotion="user"`
 * gives on the JS side, so the two halves stay in step.
 */
export function useMotionMode() {
  const [mode, setMode] = useState<MotionMode>(loadMotionMode);
  const [systemReduced, setSystemReduced] = useState(() => motionIsReduced('system'));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const reduced = mode === 'reduced' || (mode === 'system' && systemReduced);

  useEffect(() => {
    const root = document.documentElement;
    if (reduced) root.setAttribute('data-motion', 'reduced');
    else root.removeAttribute('data-motion');
  }, [reduced]);

  const changeMode = useCallback((next: MotionMode) => {
    setMode(next);
    saveMotionMode(next);
  }, []);

  return { mode, changeMode, reduced };
}
