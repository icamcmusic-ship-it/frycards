import { useEffect, useRef } from 'react';

/**
 * Selector for "things Tab stops on", used by the trap below.
 *
 * Typed as `string` on purpose: TypeScript's DOM lib parses a *literal*
 * selector to infer the element type, cannot parse this one, and hands back
 * `unknown` for every node.
 */
export const FOCUSABLE_SELECTOR: string =
  'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), a[href], ' +
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Hold the keyboard inside a modal dialog, and give it back on close.
 *
 * Every modal in this app was written the same way — `role="dialog"`,
 * `aria-modal="true"`, a `tabIndex={-1}` wrapper, and an effect that focuses
 * that wrapper on mount and restores the trigger on unmount — with a comment
 * saying this was "so a keyboard user can't Tab through to the (only visually)
 * obscured page underneath". **It is not.** `aria-modal` tells a screen reader
 * the rest of the document is inert and tells sequential focus navigation
 * nothing at all, and moving focus in once does not keep it there: a dialog
 * mounts at the END of the DOM, so Tab from its last control walks off the
 * document, through the browser's own chrome, and back in at the TOP of the
 * page — which is the thing the dialog is covering.
 *
 * v30 found it by pressing the key. `drive:match`'s Tab walk landed on the
 * match board's ✕ CONCEDE from inside the mulligan dialog on the first run
 * that looked, which is a keyboard user resigning a game out of a dialog that
 * asked them to keep or mulligan a hand.
 *
 * So: Tab from the last focusable control wraps to the first, Shift+Tab from
 * the first wraps to the last, and focus that has got out some other way is
 * pulled back in on the next Tab. The listener is `keydown` in the CAPTURE
 * phase so it runs before any window-level shortcut handler, and it only ever
 * acts on Tab — Escape, Space and everything else pass straight through.
 *
 * `active` lets a caller mount the hook unconditionally and switch it on: pass
 * `true` from a component that only renders while its dialog is open.
 */
/**
 * Every trap currently mounted.
 *
 * Two modals CAN be on screen at once — the match board raises the concede
 * confirm over the shed picker, and either can sit under the card inspector —
 * and two active traps fight: on each Tab the outer one yanks focus into
 * itself and the inner one yanks it back, so focus lands in the same place
 * every press and the keyboard stops working entirely. `drive:match` reported
 * it as "focus did not move across 4 Tab presses on CONFIRM", which is exactly
 * what a player would have experienced.
 *
 * So only ONE trap handles the key, and which one is decided by DOCUMENT
 * ORDER rather than by mount order. These dialogs are siblings at the same
 * stacking level, so the one that appears last in the DOM is the one painted
 * on top — and mount order does not agree with that: open the card inspector
 * first and the shed picker second and the later-mounted trap is the one
 * underneath.
 */
const traps = new Set<{ el: () => HTMLElement | null }>();

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const token = { el: () => ref.current as HTMLElement | null };
    traps.add(token);
    /** Is this the trap whose root is last in the document — the top one? */
    const isTop = () => {
      const mine = ref.current as HTMLElement | null;
      if (!mine || !mine.isConnected) return false;
      for (const other of traps) {
        if (other === token) continue;
        const el = other.el();
        if (!el || !el.isConnected) continue;
        // DOCUMENT_POSITION_FOLLOWING: `el` comes after `mine`, so `el` is on
        // top and this trap is not the one that should be holding the key.
        if (mine.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return false;
      }
      return true;
    };
    const prevFocused = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (!isTop()) return;
      const root = ref.current;
      if (!root) return;
      const items = (Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]).filter(
        (el) => el.getClientRects().length > 0,
      );
      // A dialog with nothing focusable inside it still must not leak — the
      // wrapper itself carries tabIndex={-1} and is what was focused on open.
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement as HTMLElement | null;
      if (!at || !root.contains(at)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && at === first) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      traps.delete(token);
      prevFocused?.focus?.();
    };
  }, [active]);
  return ref;
}
