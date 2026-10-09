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

/** Phone: opponents line the top two thirds in two columns. */
const NARROW: Record<number, SeatPos[]> = {
  2: [
    [50, 94],
    [50, 10],
  ],
  3: [
    [50, 94],
    [25, 10],
    [75, 10],
  ],
  4: [
    [50, 94],
    [17, 12],
    [50, 6],
    [83, 12],
  ],
  5: [
    [50, 94],
    [16, 34],
    [28, 7],
    [72, 7],
    [84, 34],
  ],
  6: [
    [50, 94],
    [15, 40],
    [15, 10],
    [50, 5],
    [85, 10],
    [85, 40],
  ],
};

export function seatPositions(seats: number, narrow: boolean): SeatPos[] {
  const n = Math.max(2, Math.min(6, seats));
  return (narrow ? NARROW : DESKTOP)[n];
}

/** Where a seat's bet sits: part-way from the seat towards the pot. */
export function betPosition(seat: SeatPos, k = 0.36): SeatPos {
  return [seat[0] + (50 - seat[0]) * k, seat[1] + (46 - seat[1]) * k];
}
