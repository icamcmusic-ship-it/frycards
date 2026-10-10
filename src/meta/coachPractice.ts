/**
 * "Try it" from How to Play: the first-match coach (CoachOverlay) only ever
 * shows once, then stores this flag. Clearing it makes the next match open with
 * the walkthrough again, which is all a practice link needs.
 *
 * The coach's stage vocabulary lives here too, so the poker table can drive
 * `<CoachOverlay stage={…} />` and mark its elements without importing the
 * overlay's internals.
 */
export const COACH_DONE_KEY = 'frycards_coach_done';

/**
 * One idea per stage, in the order a first game meets them. The table sets the
 * stage when the idea first matters:
 *  - `hand`     — the human's hole cards are dealt (first hand).
 *  - `bet`      — it is the human's turn to bet for the first time.
 *  - `board`    — the flop is on the table.
 *  - `power`    — the human holds a power they could cast on their turn.
 *  - `location` — a Location rule other than Plain Table is active.
 *  - `nerve`    — the human's Leader abilities are usable (or nerve moved).
 * Any other string (e.g. 'idle') means "nothing to teach right now".
 */
export type CoachStage = 'hand' | 'bet' | 'board' | 'power' | 'location' | 'nerve';

export const COACH_STAGES: CoachStage[] = ['hand', 'bet', 'board', 'power', 'location', 'nerve'];

/**
 * Stages that always occur in a first game when the table shows them. The
 * coach counts itself finished once these have all been shown, even if the
 * optional ones (`location`, `nerve`) never came up — otherwise a player
 * whose first game never hits a Location or a Leader turn would replay the
 * tutorial in every match.
 */
export const REQUIRED_COACH_STAGES: CoachStage[] = ['hand', 'bet', 'board', 'power'];

/** The `data-coach` hook each stage spotlights. The table puts
 * `data-coach="hole"` etc. on the matching element. */
export const COACH_ANCHORS: Record<CoachStage, string> = {
  hand: '[data-coach="hole"]',
  bet: '[data-coach="actions"]',
  board: '[data-coach="board"]',
  power: '[data-coach="powers"]',
  location: '[data-coach="location"]',
  nerve: '[data-coach="leader"]',
};

export function restartCoach(): void {
  try {
    localStorage.removeItem(COACH_DONE_KEY);
  } catch {
    /* storage blocked — the coach just keeps its current state */
  }
}
