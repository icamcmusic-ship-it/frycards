/**
 * iOS gates DeviceOrientationEvent behind a user-gesture permission prompt
 * (`DeviceOrientationEvent.requestPermission`). Elsewhere orientation just
 * works. This hook says whether to show the "Tilt to shine" button and
 * whether useHoloTilt may follow orientation; the choice is remembered.
 */
import { useCallback, useState } from 'react';

export const TILT_PERMISSION_KEY = 'fc-tilt-permission';

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

function api(): PermissionApi | null {
  if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined')
    return null;
  return window.DeviceOrientationEvent as unknown as PermissionApi;
}

function load(): string | null {
  try {
    return window.localStorage.getItem(TILT_PERMISSION_KEY);
  } catch {
    return null;
  }
}

function save(v: string) {
  try {
    window.localStorage.setItem(TILT_PERMISSION_KEY, v);
  } catch {
    // private mode / blocked storage: the button just shows again next time
  }
}

export function useTiltPermission() {
  const gated = typeof api()?.requestPermission === 'function';
  const [state, setState] = useState<string | null>(() => (gated ? load() : 'granted'));
  const request = useCallback(async () => {
    const fn = api()?.requestPermission;
    if (!fn) return;
    let r: string;
    try {
      r = await fn.call(window.DeviceOrientationEvent);
    } catch {
      r = 'denied';
    }
    save(r);
    setState(r);
  }, []);
  return {
    /** Show the button: the API is gated and the player hasn't answered. */
    needsButton: gated && state !== 'granted' && state !== 'denied',
    /** Follow device orientation. */
    orientation: !gated || state === 'granted',
    request,
  };
}
