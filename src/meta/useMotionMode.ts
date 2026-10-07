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
    // 'full' is written too, so CSS can let FULL override the OS setting
    // (the OS media blocks are scoped to html:not([data-motion='full'])).
    if (reduced) root.setAttribute('data-motion', 'reduced');
    else if (mode === 'full') root.setAttribute('data-motion', 'full');
    else root.removeAttribute('data-motion');
  }, [reduced, mode]);

  const changeMode = useCallback((next: MotionMode) => {
    setMode(next);
    saveMotionMode(next);
  }, []);

  return { mode, changeMode, reduced };
}

/**
 * Whether motion is suppressed right now, for components that switch JS
 * behaviour (not just CSS) on it. Follows the effective in-app setting by
 * watching the `<html data-motion>` attribute `useMotionMode` writes, so a
 * change in Settings reaches every mounted reader — the per-component
 * matchMedia hooks this replaces only ever saw the OS setting.
 */
export function useReducedMotion(): boolean {
  const read = () =>
    typeof document !== 'undefined' && document.documentElement.dataset.motion
      ? document.documentElement.dataset.motion === 'reduced'
      : motionIsReduced(loadMotionMode());
  const [reduced, setReduced] = useState(read);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => setReduced(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    let mq: MediaQueryList | undefined;
    try {
      mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    } catch {
      mq = undefined;
    }
    const onChange = () => setReduced(read());
    mq?.addEventListener('change', onChange);
    return () => {
      mo.disconnect();
      mq?.removeEventListener('change', onChange);
    };
  }, []);
  return reduced;
}
