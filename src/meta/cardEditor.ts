/**
 * The Creator card editor's pure logic (docs/CARD_SUBMISSIONS.md, "Card
 * editor").
 *
 * `template.overrides` already let the Creator change a power's tier, effect,
 * modifiers, subtype and rules text, and `deriveCardMechanics` (cardpool.ts)
 * honours exactly those. This module extends the override object with the
 * fields the generator still rolls on its own:
 *
 *   colors     a card's colour identity (Leaders: 1-2 colours)
 *   abilities  a Leader's two nerve abilities ([spend, build])
 *   rule       a Location's rule template and parameter
 *   manual     informational: the Creator skipped the roll for every field
 *
 * They are layered over the derived card by `applyExtendedOverrides`, which
 * the editor preview, the mechanics columns and verify:pool use. The game
 * client builds its pool in cardpool.ts (owned by the engine), which does not
 * read these three keys yet; see "Engine support" in the doc for the exact
 * patch. Until it lands, verify:pool flags any card that uses them.
 *
 * Read-only use of src/game/poker exports only.
 */
import {
  RARITIES,
  type CardOverrides,
  type CardTemplate,
  type CardType,
  type Rarity,
} from '../types';
import { buildCost, deriveCardMechanics, powerText } from '../game/poker/cardpool';
import { isPower, type CardDef, type CardSubtype, type KwRef } from '../game/poker/cards';
import type { LeaderAbility, LocationRule, LocationRuleId } from '../game/poker/cards';
import { COLORS, type Color } from '../game/poker/colors';
import {
  CHIP_KEYWORDS,
  KEYWORD_SPECS,
  fmtUnits,
  keywordAllowed,
  keywordLabel,
  tierN,
  type Keyword,
} from '../game/poker/keywords';
import { LOCATION_TEMPLATES, ruleName, ruleText } from '../game/poker/locations';
import { mechanicsFromDef, type CardUpsertPayload } from './submissions';

export interface AbilityOverride {
  kw: Keyword;
  n?: number;
  /** Spend ability: -1..-5; build ability: +1..+3. */
  nerve: number;
}

export type ExtendedOverrides = CardOverrides & {
  colors?: Color[];
  abilities?: [AbilityOverride, AbilityOverride];
  rule?: LocationRule;
  manual?: boolean;
};

/** Every key the editor may write, in display order. */
export const EDITOR_FIELDS = [
  'colors',
  'tier',
  'effect',
  'mods',
  'subtype',
  'abilities',
  'rule',
  'text',
] as const;
export type EditorField = (typeof EDITOR_FIELDS)[number];

/** Which fields a card of this type has at all. */
export function fieldsFor(type: CardType): EditorField[] {
  if (type === 'Leader') return ['colors', 'abilities', 'text'];
  if (type === 'Location') return ['colors', 'rule', 'text'];
  const f: EditorField[] = ['colors', 'tier', 'effect', 'mods'];
  if (type === 'Item' || type === 'Event') f.push('subtype');
  f.push('text');
  return f;
}

export const SUBTYPES_BY_TYPE: Partial<Record<CardType, CardSubtype[]>> = {
  Item: ['Charm', 'Weapon', 'Tool'],
  Event: ['Quick', 'Slow'],
};

const EFFECT_NOT_ON: Partial<Record<CardType, Keyword[]>> = {
  Unit: ['Snuff'],
  Item: ['Snuff', 'Straddle'],
};

/** Drop undefined/null and keys a type cannot carry. Returns undefined when
 * nothing is left, so "changed nothing" never writes an override. */
export function pruneExtended(
  o: ExtendedOverrides | null | undefined,
  type: CardType,
): ExtendedOverrides | undefined {
  if (!o) return undefined;
  const allowed = new Set<string>(fieldsFor(type));
  const out: Record<string, unknown> = {};
  for (const k of EDITOR_FIELDS) {
    const v = (o as Record<string, unknown>)[k];
    if (v === undefined || v === null || !allowed.has(k)) continue;
    out[k] = v;
  }
  if (Object.keys(out).length === 0) return undefined;
  if (o.manual) out.manual = true;
  return out as ExtendedOverrides;
}

function abilityText(a: LeaderAbility): string {
  const sign = a.nerve > 0 ? `+${a.nerve}` : `${a.nerve}`;
  const cost = a.chipCost ? `, pay ${fmtUnits(a.chipCost)}` : '';
  return `${sign} nerve${cost}: ${keywordLabel(a.effect.kw as Keyword, a.effect.n)}.`;
}

function toAbility(o: AbilityOverride, tier: number): LeaderAbility {
  const n = KEYWORD_SPECS[o.kw]?.numbered ? (o.n ?? tierN(o.kw, tier)) : undefined;
  const effect: KwRef = n === undefined ? { kw: o.kw } : { kw: o.kw, n };
  const chipCost =
    o.nerve > 0 && o.kw !== 'Straddle'
      ? buildCost(o.kw as Parameters<typeof buildCost>[0])
      : undefined;
  const a: LeaderAbility = { nerve: o.nerve, effect, chipCost, text: '' };
  a.text = abilityText(a);
  return a;
}

/** Layer the extended keys over an already-derived card. */
export function applyExtendedOverrides(def: CardDef, o?: ExtendedOverrides | null): CardDef {
  if (!o) return def;
  const out: CardDef = { ...def };
  if (o.colors) out.colors = [...o.colors];
  if (def.type === 'Leader' && o.abilities) {
    // Same tiers the generator uses: spend at 4, build at 2.
    out.abilities = [toAbility(o.abilities[0], 4), toAbility(o.abilities[1], 2)];
    out.keywords = out.abilities.map((a) => a.effect.kw);
    if (!o.text) out.text = out.abilities.map((a) => a.text).join(' ');
  }
  if (def.type === 'Location' && o.rule) {
    out.rule = { ...o.rule };
    if (!o.text) out.text = `${ruleName(o.rule)}: ${ruleText(o.rule)}`;
  }
  if (isPower(out) && o.colors && !o.text) out.text = powerText(out);
  return out;
}

/** The card exactly as the editor will print it. */
export function deriveEdited(t: CardTemplate): CardDef {
  return applyExtendedOverrides(deriveCardMechanics(t), t.overrides as ExtendedOverrides);
}

/** The card with no overrides at all — what RESET TO ROLLED restores. */
export function deriveRolled(t: CardTemplate): CardDef {
  return deriveCardMechanics({ ...t, overrides: undefined });
}

/** Every field filled in from a derived card: MANUAL mode starts here, so
 * switching it on changes nothing until the Creator edits a field. */
export function overridesFromDef(def: CardDef): ExtendedOverrides {
  const o: ExtendedOverrides = { colors: [...def.colors], manual: true };
  if (isPower(def)) {
    o.tier = def.tier;
    if (def.effect) o.effect = { ...def.effect };
    o.mods = (def.mods ?? []).map((m) => ({ ...m }));
    if (def.subtype) o.subtype = def.subtype;
  } else if (def.type === 'Leader' && def.abilities?.length === 2) {
    o.abilities = def.abilities.map((a) => ({
      kw: a.effect.kw as Keyword,
      n: a.effect.n,
      nerve: a.nerve,
    })) as [AbilityOverride, AbilityOverride];
  } else if (def.type === 'Location' && def.rule) {
    o.rule = { ...def.rule };
  }
  return pruneExtended(o, def.type) ?? { manual: true };
}

function numberProblem(kw: Keyword, n: number | undefined): string | null {
  if (n === undefined) return null;
  const s = KEYWORD_SPECS[kw];
  if (!s.numbered) return `${kw} takes no number.`;
  if (!(n > 0) || !Number.isFinite(n)) return `${kw}'s number must be positive.`;
  if (CHIP_KEYWORDS.has(kw)) {
    return Number.isInteger(n * 4) ? null : `${kw} is a chip amount in quarter units (½, 1½…).`;
  }
  return Number.isInteger(n) ? null : `${kw} must be a whole number.`;
}

export const CARD_TYPES: CardType[] = ['Leader', 'Unit', 'Item', 'Event', 'Location'];

/**
 * Check a template (identity + overrides) against the engine's rules. Returns
 * player-facing problems; empty means it may be saved. `manual` additionally
 * requires every field of the type to be set by hand.
 */
export function validateEdit(t: CardTemplate): string[] {
  const p: string[] = [];
  const o = (t.overrides ?? {}) as ExtendedOverrides;
  if (!/^[a-z0-9_]{3,64}$/.test(t.id)) p.push('Card id must be 3–64 characters of a-z, 0-9 or _.');
  if (!t.name.trim() || t.name.trim().length > 80) p.push('Name must be 1–80 characters.');
  if (!CARD_TYPES.includes(t.type)) p.push(`Unknown card type ${t.type}.`);
  if (!RARITIES.includes((t.rarity ?? 'Common') as Rarity)) p.push(`Unknown rarity ${t.rarity}.`);
  if (!(t.set ?? '').trim()) p.push('Set is required.');
  if ((t.flavor ?? '').length > 500) p.push('Flavor text must be 500 characters or fewer.');
  if (p.length) return p;

  if (o.manual) {
    const missing = fieldsFor(t.type).filter(
      (f) => f !== 'text' && f !== 'mods' && (o as Record<string, unknown>)[f] === undefined,
    );
    if (missing.length) p.push(`MANUAL mode: set ${missing.join(', ')} by hand.`);
  }
  if (o.colors) {
    if (o.colors.some((c) => !COLORS.includes(c))) p.push('Unknown colour.');
    if (new Set(o.colors).size !== o.colors.length) p.push('A colour is listed twice.');
    if (t.type === 'Leader' && (o.colors.length < 1 || o.colors.length > 2))
      p.push('A Leader has one or two colours.');
    if (o.colors.length > 3) p.push('At most three colours.');
  }
  if (o.tier !== undefined && (!Number.isInteger(o.tier) || o.tier < 1 || o.tier > 5))
    p.push('Tier must be 1–5.');
  if (o.subtype !== undefined && !(SUBTYPES_BY_TYPE[t.type] ?? []).includes(o.subtype))
    p.push(`${t.type}s can't be ${o.subtype}.`);
  if (o.rule) {
    const tpl = LOCATION_TEMPLATES[o.rule.id as LocationRuleId];
    if (!tpl) p.push(`Unknown Location rule ${o.rule.id}.`);
    else if (tpl.params && (o.rule.param === undefined || !tpl.params.includes(o.rule.param)))
      p.push(`${tpl.name} takes one of: ${tpl.params.join(', ')}.`);
    else if (!tpl.params && o.rule.param !== undefined) p.push(`${tpl.name} takes no parameter.`);
  }
  if (o.text !== undefined && o.text.length > 400)
    p.push('Rules text must be 400 characters or fewer.');
  if (p.length) return p;

  // Engine rules on the card as it will actually print.
  const def = deriveEdited(t);
  const colors = def.colors;
  if (isPower(def)) {
    const e = def.effect;
    if (!e || KEYWORD_SPECS[e.kw as Keyword]?.kind !== 'effect') p.push('Pick an effect keyword.');
    else {
      const kw = e.kw as Keyword;
      if (!keywordAllowed(kw, colors)) p.push(`${kw} is gated to ${KEYWORD_SPECS[kw].color}.`);
      if ((EFFECT_NOT_ON[t.type] ?? []).includes(kw)) p.push(`${kw} can't print on a ${t.type}.`);
      const bad = numberProblem(kw, o.effect?.n);
      if (bad) p.push(bad);
    }
    const seen = new Set<string>();
    for (const m of def.mods ?? []) {
      const kw = m.kw as Keyword;
      const spec = KEYWORD_SPECS[kw];
      if (!spec) p.push(`Not a poker keyword: ${m.kw}.`);
      else if (spec.kind !== 'modifier') p.push(`${kw} is an effect, not a modifier.`);
      else if (!keywordAllowed(kw, colors)) p.push(`${kw} is gated to ${spec.color}.`);
      if (seen.has(m.kw)) p.push(`${m.kw} is listed twice.`);
      seen.add(m.kw);
    }
    for (const m of o.mods ?? []) {
      const bad = KEYWORD_SPECS[m.kw as Keyword] ? numberProblem(m.kw as Keyword, m.n) : null;
      if (bad) p.push(bad);
    }
    if ((o.mods?.length ?? 0) > 3) p.push('At most three modifiers.');
  } else if (def.type === 'Leader' && o.abilities) {
    const [spend, build] = o.abilities;
    if (!(spend.nerve <= -1 && spend.nerve >= -5)) p.push('The spend ability costs 1–5 nerve.');
    if (!(build.nerve >= 1 && build.nerve <= 3)) p.push('The build ability gives 1–3 nerve.');
    for (const a of o.abilities) {
      const spec = KEYWORD_SPECS[a.kw];
      if (!spec || spec.kind !== 'effect') p.push(`${a.kw}: a Leader ability must be an effect.`);
      else {
        if (spec.target === 'cast') p.push(`${a.kw} targets a cast, which a Leader can't.`);
        if (!keywordAllowed(a.kw, colors)) p.push(`${a.kw} is gated to ${spec.color}.`);
        const bad = numberProblem(a.kw, a.n);
        if (bad) p.push(bad);
      }
    }
  }
  return p;
}

/** Human summary of which fields are hand-set. */
export function describeEdits(o?: ExtendedOverrides | null): string {
  if (!o) return '';
  if (o.manual) return 'every field (MANUAL)';
  return EDITOR_FIELDS.filter((k) => (o as Record<string, unknown>)[k] !== undefined).join(', ');
}

/** "Fuse 1, Veil" → refs; null when any token is not a keyword. */
export function parseRefs(raw: string): KwRef[] | null {
  const out: KwRef[] = [];
  for (const part of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^(.+?)(?:\s+([\d.½¼¾]+))?$/.exec(part);
    if (!m) return null;
    const kw = (Object.keys(KEYWORD_SPECS) as Keyword[]).find(
      (k) => k.toLowerCase() === m[1].toLowerCase(),
    );
    if (!kw) return null;
    const n = m[2]
      ? Number(m[2].replace('½', '.5').replace('¼', '.25').replace('¾', '.75'))
      : undefined;
    out.push(n === undefined ? { kw } : { kw, n });
  }
  return out;
}

/** One row for `creator_update_card` / `creator_review_submission`: the
 * template's overrides and the mechanics columns written from the SAME
 * derived card, so they can never disagree. */
export function buildEditedPayload(t: CardTemplate): CardUpsertPayload {
  const overrides = pruneExtended(t.overrides as ExtendedOverrides, t.type);
  const template: CardTemplate = { ...t, overrides: overrides as CardOverrides | undefined };
  if (!overrides) delete template.overrides;
  return {
    id: t.id,
    name: t.name.trim(),
    card_type: t.type,
    rarity: (t.rarity ?? 'Common') as Rarity,
    set_name: (t.set ?? '').trim(),
    flavor_text: (t.flavor ?? '').trim(),
    image_url: t.image ?? '',
    mechanics: mechanicsFromDef(deriveEdited(template)),
    ...(overrides ? { overrides: overrides as CardOverrides } : {}),
  };
}

/** Override keys this module applies that cardpool.ts does not (yet). */
export const EXTENDED_ENGINE_KEYS = ['colors', 'abilities', 'rule'] as const;

/** Refs back into the "Fuse 1, Veil" form. */
export function formatRefs(refs: KwRef[] = []): string {
  return refs.map((r) => (r.n === undefined ? r.kw : `${r.kw} ${r.n}`)).join(', ');
}
