/**
 * Chip motion on the felt (audit U7): at the end of a street each seat's bet
 * slides into the pot, and when a hand is decided the pot slides to the
 * winner(s). Purely decorative: the numbers on the table are already right
 * when the chips fly. Off when motion is reduced (the stack ±deltas and the
 * pot bump still show what changed).
 *
 * Coordinates are percentages of the felt box, the same space the seat
 * plates (`positions`) and the bet pills (`betPosition`) are laid out in. The
 * pot is measured from the `[data-pot]` element inside the felt.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { SeatPos } from './pokerLayout';

export interface ChipFlight {
  id: number;
  from: SeatPos;
  to: SeatPos;
  delay: number;
}

const FLY_MS = 420;

/** Pure: the flights a change of table state produces. Exported for tests. */
export function flightsFor(
  prev: { key: string; hand: number; bets: number[]; done: boolean },
  next: { key: string; hand: number; bets: number[]; done: boolean; winners: number[] },
  betAt: (seat: number) => SeatPos,
  seatAt: (seat: number) => SeatPos,
  pot: SeatPos,
  nextId: () => number,
): ChipFlight[] {
  const out: ChipFlight[] = [];
  const sameHand = prev.hand === next.hand;
  const decided = sameHand && !prev.done && next.done;
  // A street ended (or the hand did): last street's bets go in.
  if (sameHand && (prev.key !== next.key || decided)) {
    prev.bets.forEach((b, i) => {
      if (b > 0) out.push({ id: nextId(), from: betAt(i), to: pot, delay: 0 });
    });
  }
  // The hand was just decided: the pot goes out to the winner(s).
  if (decided) {
    const lead = out.length ? FLY_MS : 0;
    for (const w of next.winners)
      out.push({ id: nextId(), from: pot, to: seatAt(w), delay: lead + 120 });
  }
  return out;
}

export function ChipFlights({
  feltRef,
  handNo,
  streetKey,
  bets,
  done,
  winners,
  betAt,
  seatAt,
  reduced,
}: {
  feltRef: React.RefObject<HTMLDivElement | null>;
  handNo: number;
  streetKey: string;
  bets: number[];
  done: boolean;
  winners: number[];
  betAt: (seat: number) => SeatPos;
  seatAt: (seat: number) => SeatPos;
  reduced: boolean;
}) {
  const prev = useRef({ key: streetKey, hand: handNo, bets, done });
  // The bets as of the previous render: when the street turns, this render's
  // `bets` are already the new street's (zeros).
  const lastBets = useRef(bets);
  const seq = useRef(0);
  const [flights, setFlights] = useState<ChipFlight[]>([]);
  const winKey = winners.join(',');

  useEffect(() => {
    const before = { ...prev.current, bets: lastBets.current };
    prev.current = { key: streetKey, hand: handNo, bets, done };
    if (reduced) return;
    const felt = feltRef.current;
    const potEl = felt?.querySelector('[data-pot]');
    let pot: SeatPos = [50, 50];
    if (felt && potEl) {
      const f = felt.getBoundingClientRect();
      const p = potEl.getBoundingClientRect();
      if (f.width > 0 && f.height > 0)
        pot = [
          ((p.left + p.width / 2 - f.left) / f.width) * 100,
          ((p.top + p.height / 2 - f.top) / f.height) * 100,
        ];
    }
    const add = flightsFor(
      before,
      { key: streetKey, hand: handNo, bets, done, winners },
      betAt,
      seatAt,
      pot,
      () => ++seq.current,
    );
    if (!add.length) return;
    const t0 = window.setTimeout(() => setFlights((f) => [...f, ...add]), 0);
    const ids = new Set(add.map((a) => a.id));
    const t = window.setTimeout(
      () => setFlights((f) => f.filter((x) => !ids.has(x.id))),
      Math.max(...add.map((a) => a.delay)) + FLY_MS + 80,
    );
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t);
    };
    // bets are read from the snapshot taken when the key changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetKey, handNo, done, winKey, reduced]);

  useEffect(() => {
    lastBets.current = bets;
  });

  if (!flights.length) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {flights.map((fl) => (
        <Flight key={fl.id} flight={fl} />
      ))}
    </div>
  );
}

function Flight({ flight }: { key?: React.Key; flight: ChipFlight }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const a = el.animate(
      [
        { left: `${flight.from[0]}%`, top: `${flight.from[1]}%`, opacity: 1 },
        { left: `${flight.to[0]}%`, top: `${flight.to[1]}%`, opacity: 0.9 },
      ],
      { duration: FLY_MS, delay: flight.delay, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' },
    );
    return () => a.cancel();
  }, [flight]);
  return (
    <span
      ref={ref}
      data-chip-flight
      className="absolute -translate-x-1/2 -translate-y-1/2 flex"
      style={{ left: `${flight.from[0]}%`, top: `${flight.from[1]}%` }}
    >
      {[0, 1, 2].map((k) => (
        <span
          key={k}
          className="block w-3.5 h-3.5 rounded-full bg-[var(--c-yellow)] border-2 border-[var(--c-ink)] shadow-hard-black-xs"
          style={{ marginLeft: k ? -8 : 0, marginTop: -k * 2 }}
        />
      ))}
    </span>
  );
}
