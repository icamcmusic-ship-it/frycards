/**
 * "Try it" from How to Play: the first-match coach (CoachOverlay) only ever
 * shows once, then stores this flag. Clearing it makes the next match open with
 * the walkthrough again, which is all a practice link needs.
 */
export const COACH_DONE_KEY = 'frycards_coach_done';

export function restartCoach(): void {
  try {
    localStorage.removeItem(COACH_DONE_KEY);
  } catch {
    /* storage blocked — the coach just keeps its current state */
  }
}
