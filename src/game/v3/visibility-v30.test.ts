/**
 * v30 suite — the third warning on the divider, and the keyboard.
 *
 * 1. **`phaseAdvanceLabel` in the Clash.** Two of the divider's four labels
 *    warn the player about something a press makes permanent (`· N PLAYABLE`
 *    since v26, `· WELLSPRING UNPLAYED` since v29) and both of them are on the
 *    button that ENDS the turn. The button that LEAVES THE CLASH carried
 *    nothing, and it is the one whose omission costs the most: a whole combat
 *    step, given up by a player who read `SKIP TO MAIN II ▸` as "next".
 *
 * 2. **The keyboard.** Every axis this project has measured is a pointer axis
 *    — overflow is what a finger cannot scroll to, 24x24 is what a thumb
 *    cannot hit, reflow and text-resize are both about a phone. This suite
 *    pins the part of keyboard operation that is decidable without a browser:
 *    that every `role="button"` the match board draws carries both a
 *    `tabIndex` and an Enter/Space handler, which is the pair a `div` needs in
 *    order to be a control at all. The browser half — that Tab actually
 *    reaches them and that each draws a focus ring — is measured by
 *    `audit:screens`'s keyboard walk.
 *
 * 3. **Every modal holds the keyboard.** Every dialog in this app declared
 *    `aria-modal="true"` and then let Tab walk straight out of it onto the
 *    page it was covering — `aria-modal` is an accessibility-tree statement
 *    and says nothing to sequential focus navigation, and the effect that
 *    moved focus IN once (with a comment claiming it stopped exactly this)
 *    cannot keep it there. `drive:match`'s Tab walk landed on the match
 *    board's ✕ CONCEDE from inside the mulligan dialog. The fix is one shared
 *    hook; this is the scan that stops the next dialog shipping without it.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { phaseAdvanceLabel } from '../../components/GameV4';

// ---------------------------------------------------------------------------
// 1. The Clash phase button
// ---------------------------------------------------------------------------
describe('phaseAdvanceLabel — leaving the Clash', () => {
  const none = { playable: 0, shed: 0, wellspringWasted: false };

  test('says how many units are still able to swing', () => {
    expect(phaseAdvanceLabel('Clash', { ...none, readyAttackers: 3 })).toBe(
      'SKIP TO MAIN II ▸ · 3 CAN ATTACK',
    );
    expect(phaseAdvanceLabel('Clash', { ...none, readyAttackers: 1 })).toBe(
      'SKIP TO MAIN II ▸ · 1 CAN ATTACK',
    );
  });

  test('stays silent when nothing can attack — the usual case after a swing', () => {
    // Every attacker that has already swung is exhausted, so `legalAttackers`
    // is empty and the button must not nag about a decision already taken.
    expect(phaseAdvanceLabel('Clash', { ...none, readyAttackers: 0 })).toBe('SKIP TO MAIN II ▸');
    expect(phaseAdvanceLabel('Clash', none)).toBe('SKIP TO MAIN II ▸');
  });

  test('the warning belongs to the Clash and to no other phase', () => {
    // A ready attacker in Main I is not a warning: TO CLASH is the button that
    // takes the player TO the swing, not past it.
    expect(phaseAdvanceLabel('Main1', { ...none, readyAttackers: 4 })).toBe('TO CLASH ▸');
    expect(phaseAdvanceLabel('Main2', { ...none, readyAttackers: 4 })).toBe('END TURN ▸');
    expect(phaseAdvanceLabel('Dawn', { ...none, readyAttackers: 4 })).toBe('NEXT ▸');
  });

  test('the v29 warnings are untouched', () => {
    expect(phaseAdvanceLabel('Main2', { ...none, playable: 2, wellspringWasted: true })).toBe(
      'END TURN ▸ · 2 PLAYABLE · WELLSPRING UNPLAYED',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Every div that acts like a button has to behave like one
// ---------------------------------------------------------------------------
/**
 * This game draws a large share of its controls as `<div role="button">`, and
 * for a real reason: a `CardFace` prints its own keyword and cost chips as
 * `<button>`s, and nesting a button inside a button is invalid HTML that
 * breaks keyboard and screen-reader navigation. The cost of that choice is
 * that focusability and activation stop being free — a `div` is not in the tab
 * order without `tabIndex`, and it does not fire on Enter or Space without a
 * handler. Both are things somebody has to remember, on every new one.
 */
describe('role="button" divs are operable without a pointer', () => {
  const FILES = [
    'src/components/GameV4.tsx',
    'src/components/CardFaceV4.tsx',
    'src/meta/GradedSlab.tsx',
    'src/meta/PackOpening.tsx',
    'src/meta/ShowroomScreen.tsx',
  ];

  test('each carries a tabIndex and an Enter/Space handler', () => {
    const missing: string[] = [];
    /**
     * How many elements the scan actually looked at.
     *
     * Asserted below, because a scan that matches nothing and a codebase with
     * nothing wrong print exactly the same green tick — and this file's own
     * subject is instruments that stopped firing without saying so. If the
     * `role="button"` spelling ever changes, this number goes to zero and the
     * test says so instead of passing.
     */
    let scanned = 0;
    for (const file of FILES) {
      const src = readFileSync(file, 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/role=(["'])button\1/.test(lines[i])) continue;
        scanned += 1;
        // The JSX element's own attribute block: from the opening `<` above to
        // the `>` below. A 40-line window covers the largest of them with room
        // to spare, and the two attributes are always in the same element.
        const from = Math.max(0, i - 12);
        const window = lines.slice(from, Math.min(lines.length, i + 40)).join('\n');
        const hasTabIndex = /tabIndex=/.test(window);
        const hasKeys = /onKeyDown=/.test(window);
        if (!hasTabIndex || !hasKeys) {
          missing.push(
            `${file}:${i + 1} — ${!hasTabIndex ? 'no tabIndex' : ''}${
              !hasTabIndex && !hasKeys ? ' and ' : ''
            }${!hasKeys ? 'no onKeyDown' : ''}`,
          );
        }
      }
    }
    expect(missing).toEqual([]);
    expect(scanned).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// 3. A dialog that says it is modal has to hold the keyboard
// ---------------------------------------------------------------------------
describe('every aria-modal dialog traps focus', () => {
  test('each file with aria-modal="true" also uses useFocusTrap', () => {
    const files = execSync('grep -rl \'aria-modal="true"\' src --include=*.tsx')
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
    // The scan has to have found something — a green tick out of an empty list
    // is the dead instrument this suite's other two tests are also guarded
    // against.
    expect(files.length).toBeGreaterThanOrEqual(8);
    const untrapped = files.filter((f) => !readFileSync(f, 'utf8').includes('useFocusTrap'));
    expect(untrapped).toEqual([]);
  });

  test('the hook wraps focus in both directions and cleans its listener up', () => {
    const src = readFileSync('src/components/useFocusTrap.ts', 'utf8');
    // Forward wrap, backward wrap, the pull-back for focus that got out, and
    // the capture-phase listener that has to beat the window-level Escape and
    // Space handlers the match board installs.
    expect(src).toMatch(/!e\.shiftKey && at === last/);
    expect(src).toMatch(/e\.shiftKey && at === first/);
    expect(src).toMatch(/!root\.contains\(at\)/);
    expect(src).toMatch(/addEventListener\('keydown', onKey, true\)/);
    expect(src).toMatch(/removeEventListener\('keydown', onKey, true\)/);
  });

  test('only the topmost trap handles Tab, and it unregisters on close', () => {
    // Two dialogs can be open at once (the concede confirm over the shed
    // picker; either under the card inspector). With two active traps each
    // Tab is fought over — the outer one pulls focus into itself, the inner
    // one pulls it back — and focus lands in the same place on every press,
    // which is a keyboard that has stopped working. `drive:match` reported
    // exactly that as "focus did not move across 4 Tab presses on CONFIRM".
    const src = readFileSync('src/components/useFocusTrap.ts', 'utf8');
    // And "topmost" is decided by DOCUMENT ORDER, not mount order: these
    // dialogs are siblings at one stacking level, so the last one in the DOM
    // is the one painted on top — and mount order disagrees whenever a dialog
    // opens over one that was already up.
    expect(src).toMatch(/traps\.add\(token\)/);
    expect(src).toMatch(/if \(!isTop\(\)\) return;/);
    expect(src).toMatch(/DOCUMENT_POSITION_FOLLOWING/);
    expect(src).toMatch(/traps\.delete\(token\)/);
  });
});
