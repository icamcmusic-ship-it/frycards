/**
 * Seat positions for the poker table, stored as data so the phone layout is
 * a layout swap, not a rewrite (Design Spec v0.1, "Desktop first"). Positions
 * are percentages of the felt: [left, top] of each seat's centre. The human
 * is always seat 0 at the bottom; play runs clockwise (bottom → left → top →
 * right), the same direction as the action.
 */
export type SeatPos = [number, number];

const DESKTOP: Record<number, SeatPos[]> = {
  2: [
    [50, 92],
    [50, 9],
  ],
  3: [
    [50, 92],
    [13, 22],
    [87, 22],
  ],
  4: [
    [50, 92],
    [8, 48],
    [50, 9],
    [92, 48],
  ],
  5: [
    [50, 92],
    [8, 64],
    [22, 11],
    [78, 11],
    [92, 64],
  ],
  6: [
    [50, 92],
    [8, 70],
    [10, 22],
    [50, 9],
    [90, 22],
    [92, 70],
  ],
};

/** Phone: the human's own seat is the panel under the felt (seat 0's entry
 * only places its bet), so the opponents line the top of the felt in rows of
 * up to three and the board sits below them (see BOARD_Y). */
const NARROW: Record<number, SeatPos[]> = {
  2: [
    [50, 94],
    [50, 11],
  ],
  3: [
    [50, 94],
    [27, 11],
    [73, 11],
  ],
  4: [
    [50, 94],
    [17, 11],
    [50, 11],
    [83, 11],
  ],
  5: [
    [50, 94],
    [17, 36],
    [30, 11],
    [70, 11],
    [83, 36],
  ],
  6: [
    [50, 94],
    [17, 36],
    [17, 11],
    [50, 11],
    [83, 11],
    [83, 36],
  ],
};

/** Vertical centre of the board's card row, in % of the felt. The pot and the
 * hand result hang below it, so it sits above the middle. */
const BOARD_Y = {
  desktop: 44,
  narrow: { 2: 46, 3: 46, 4: 46, 5: 62, 6: 62 } as Record<number, number>,
};

/** Half a seat badge's footprint in px (cards + plate), so a seat placed at a
 * percentage can be clamped inside the felt on a short or narrow screen
 * instead of hanging off its edge or under the Location banner. */
export const SEAT_HALF = {
  desktop: { w: 75, h: 60 },
  narrow: { w: 56, h: 42 },
};

export function seatPositions(seats: number, narrow: boolean): SeatPos[] {
  const n = Math.max(2, Math.min(6, seats));
  return (narrow ? NARROW : DESKTOP)[n];
}

export function boardY(seats: number, narrow: boolean): number {
  const n = Math.max(2, Math.min(6, seats));
  return narrow ? BOARD_Y.narrow[n] : BOARD_Y.desktop;
}

/** CSS `left`/`top` for a seat centre, clamped so the whole badge stays on
 * the felt. */
export function seatStyle(pos: SeatPos, narrow: boolean): { left: string; top: string } {
  const { w, h } = narrow ? SEAT_HALF.narrow : SEAT_HALF.desktop;
  return {
    left: `clamp(${w}px, ${pos[0]}%, calc(100% - ${w}px))`,
    top: `clamp(${h}px, ${pos[1]}%, calc(100% - ${h}px))`,
  };
}

/** Where a seat's bet sits: part-way from the seat towards the pot. */
export function betPosition(seat: SeatPos, potY = 46, k = 0.36): SeatPos {
  return [seat[0] + (50 - seat[0]) * k, seat[1] + (potY - seat[1]) * k];
}
