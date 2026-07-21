# PvP Design Spike

Status: proposal — no implementation yet.

## Problem

The game today runs entirely client-side: `GameV4.tsx` holds the `Game`
state object (`src/game/v3/engine.ts`) in a plain `useState`, mutates it
in place via the engine's helper functions, and forces a re-render with a
`setVersion` counter; the opponent is a local CPU, and only the final
result is reported to Supabase (`record_match_result`). For PvP this is
untenable — a client that owns the whole game state can see the opponent's
hand/deck and fabricate any action or outcome.

## Requirements

- Server-authoritative state: clients never hold hidden information
  (opponent hand, both libraries, face-down locations).
- Deterministic engine reuse: `src/game/v3/engine.ts`'s core functions are
  already pure/deterministic given a `Game` state and a seeded RNG — the
  most valuable asset for PvP — but they currently mutate the `Game` object
  in place rather than returning new state through a single `(state,
  action) → state` reducer entry point. That reducer-shaped wrapper doesn't
  exist yet and would need to be introduced as part of this work (it's a
  smaller lift than writing a server-side rules engine from scratch, since
  all the actual rules logic is reusable as-is).
- Reconnect support and per-action timeouts (the rules have no interactive
  priority, which greatly simplifies turn handling: only the active player —
  plus the defender during the block step — ever acts).

## Recommended architecture

**Supabase Edge Function + Postgres as the authority, Realtime for push.**
Keeps the existing stack; no new vendor.

1. `matches` table: `id, p1, p2, state jsonb, seq, status`, RLS so players
   can only read their own *redacted* views.
2. Edge Function `submit-action(matchId, action, seq)`:
   - loads state, checks it is the caller's window to act,
   - runs the shared `gameReducer` (the engine compiles cleanly outside the
     DOM already — the simulator proves this),
   - persists new state with optimistic-concurrency on `seq`,
   - writes two redacted views (own hand visible, opponent hidden info
     stripped) to a `match_views` table or Realtime broadcast.
3. Client: replace `useReducer` with "dispatch → RPC, state ← subscription".
   The Board/App components already render from a single `GameState` object,
   so the UI layer changes are mostly plumbing.
4. Randomness (dice, shuffles, pack-style reveals) moves server-side; the
   engine already centralizes RNG enough that seeding it in the function is
   tractable.

### Redaction

Write a `redactStateFor(playerId, state)` helper next to the engine: strip
opponent `hand` (keep count), both `deck` arrays (keep counts), and
face-down location identities. This is also independently useful for a
future spectator/replay mode.

## Phases

1. **Engine extraction** — make `src/game/v3/engine.ts` importable
   server-side with an injectable RNG seed (verify with the existing
   simulator), and wrap its mutation-based helpers in the `(state, action)
   → state` reducer entry point described above.
2. **Redaction + view model** — `redactStateFor` with unit tests proving no
   hidden info leaks (serialize and grep for opponent card ids).
3. **Hot-seat-over-network MVP** — two clients, one Edge Function, private
   invite links; no matchmaking, generous timeouts.
4. **Matchmaking + ladder** — queue table + ELO column on `profiles`
   (the ELO CPU gauntlet from the roadmap can ship first and reuse the
   rating math).
5. **Hardening** — reconnect flow, action-timeout auto-pass, concede on
   abandon, rate limiting.

## Explicitly out of scope for the MVP

- Spectating, replays, chat, tournaments.
- Interactive priority/stack — deterministic resolution stays; simultaneous
  input is needed only for mulligans and the block step.

## Open questions

- Edge Function cold-start latency per action (~100–300 ms) — acceptable for
  a turn-based game, but measure before phase 3.
- State size: `GameState` JSON per action may warrant an actions-only event
  log with periodic snapshots if rows grow large.
