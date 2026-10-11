/**
 * Weekly featured Leader and Location (audit Q19): one of each per ISO week,
 * the same for every player, picked by FNV over the week key like the Card
 * of the Day. No reward yet (that is R7, server side).
 */
import type { CardDef } from '../game/poker/cards';
import { fnv, isoWeekKey } from '../game/poker/mutators';

export function weeklyFeatured(
  pool: readonly CardDef[],
  weekKey: string = isoWeekKey(),
): { week: string; leader?: CardDef; location?: CardDef } {
  const leaders = pool.filter((c) => c.type === 'Leader');
  const locations = pool.filter((c) => c.type === 'Location');
  return {
    week: weekKey,
    leader: leaders.length ? leaders[fnv(`fry-feat-l:${weekKey}`) % leaders.length] : undefined,
    location: locations.length
      ? locations[fnv(`fry-feat-loc:${weekKey}`) % locations.length]
      : undefined,
  };
}
