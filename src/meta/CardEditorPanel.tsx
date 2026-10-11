/**
 * The Creator card editor: hand-pick any card's game data, either while
 * approving a Showcase submission or on any live card. Logic lives in
 * ./cardEditor.ts; this is the form. docs/CARD_SUBMISSIONS.md, "Card editor".
 */
import React, { useMemo, useState } from 'react';
import { CardFace } from '../components/CardFaceV4';
import { isPower } from '../game/poker/cards';
import type { LocationRuleId } from '../game/poker/cards';
import { COLORS, type Color } from '../game/poker/colors';
import { EFFECT_KEYWORDS, type Keyword } from '../game/poker/keywords';
import { LOCATION_TEMPLATES } from '../game/poker/locations';
import { cn } from '../lib/utils';
import { RARITIES, type CardTemplate, type CardType, type Rarity } from '../types';
import { askConfirm } from './confirm';
import {
  CARD_TYPES,
  EXTENDED_ENGINE_KEYS,
  SUBTYPES_BY_TYPE,
  deriveEdited,
  describeEdits,
  fieldsFor,
  formatRefs,
  overridesFromDef,
  parseRefs,
  pruneExtended,
  validateEdit,
  type AbilityOverride,
  type EditorField,
  type ExtendedOverrides,
} from './cardEditor';
import { Notice, PopButton } from './ui';

const input = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs w-full';
const label = 'flex flex-col gap-0.5 fs-xs font-black text-[var(--c-steel)]';

const FIELD_LABEL: Record<EditorField, string> = {
  colors: 'COLOURS',
  tier: 'TIER',
  effect: 'EFFECT',
  mods: 'MODIFIERS',
  subtype: 'SUBTYPE',
  abilities: 'LEADER ABILITIES',
  rule: 'LOCATION RULE',
  text: 'RULES TEXT',
};

const num = (raw: string): number | undefined => {
  const t = raw.trim().replace('½', '.5').replace('¼', '.25').replace('¾', '.75');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

export function CardEditorPanel({
  initial,
  idEditable = false,
  bundled = false,
  saveLabel,
  onSave,
  onReset,
}: {
  key?: React.Key;
  initial: CardTemplate;
  /** The id is the hash seed; only a not-yet-minted card may change it. */
  idEditable?: boolean;
  /** The card is in generated-cards.ts (rarity/type edits need fetch:cards). */
  bundled?: boolean;
  saveLabel: string;
  onSave: (t: CardTemplate) => Promise<string | null>;
  /** RESET TO ROLLED; omitted where there is nothing saved to reset. */
  onReset?: () => Promise<string | null>;
}) {
  const [t, setT] = useState<CardTemplate>(() => ({ ...initial }));
  const [ov, setOv] = useState<ExtendedOverrides>(
    () => (initial.overrides as ExtendedOverrides) ?? {},
  );
  const [modsRaw, setModsRaw] = useState(() =>
    formatRefs((initial.overrides as ExtendedOverrides)?.mods ?? []),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const pruned = useMemo(() => pruneExtended(ov, t.type), [ov, t.type]);
  const template = useMemo<CardTemplate>(
    () => ({ ...t, overrides: pruned as CardTemplate['overrides'] }),
    [t, pruned],
  );
  const preview = useMemo(() => deriveEdited(template), [template]);
  // What every field prints right now (rolled, or as already hand-set): the
  // seed for a field when its "keep rolled" box is unticked.
  const rolledNow = useMemo(() => overridesFromDef(preview), [preview]);
  const problems = useMemo(() => validateEdit(template), [template]);
  const fields = fieldsFor(t.type);
  const manual = !!ov.manual;

  const reseeded = t.id !== initial.id || t.type !== initial.type || t.rarity !== initial.rarity;
  const engineGap = EXTENDED_ENGINE_KEYS.filter((k) => pruned?.[k] !== undefined);

  const set = <K extends keyof ExtendedOverrides>(k: K, v: ExtendedOverrides[K]) =>
    setOv((o) => ({ ...o, [k]: v }));

  /** Per-field "keep rolled": unchecking it seeds the field with what the
   * card rolls right now, so nothing changes until the Creator edits it. */
  const keepRolled = (f: EditorField, keep: boolean) => {
    setOv((o) => {
      const next: ExtendedOverrides = { ...o, manual: false };
      if (keep) delete (next as Record<string, unknown>)[f];
      else if (f === 'text') next.text = preview.text ?? '';
      else (next as Record<string, unknown>)[f] = (rolledNow as Record<string, unknown>)[f];
      return next;
    });
    if (f === 'mods' && !keep) setModsRaw(formatRefs(rolledNow.mods ?? []));
  };

  const toggleManual = (on: boolean) => {
    if (on) {
      const all = overridesFromDef(preview);
      setOv({ ...all, ...(ov.text ? { text: ov.text } : {}), manual: true });
      setModsRaw(formatRefs(all.mods ?? []));
    } else setOv((o) => ({ ...o, manual: false }));
  };

  const save = async () => {
    if (busy) return;
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    if (
      reseeded &&
      !(await askConfirm(
        'Changing the id, type or rarity re-rolls every field you kept on "rolled" (the hash seed is id|type|rarity). Save anyway?',
      ))
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const err = await onSave(template);
      if (err) setError(err);
      else setNotice(`Saved${pruned ? ` (hand-set: ${describeEdits(pruned)})` : ' as rolled'}.`);
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!onReset || busy) return;
    if (!(await askConfirm('Remove every override and print this card exactly as rolled?'))) return;
    setBusy(true);
    setError('');
    try {
      const err = await onReset();
      if (err) setError(err);
      else {
        setOv({});
        setModsRaw('');
        setNotice('Reset to rolled.');
      }
    } finally {
      setBusy(false);
    }
  };

  const ab = (i: 0 | 1): AbilityOverride =>
    ov.abilities?.[i] ?? (rolledNow.abilities?.[i] as AbilityOverride);
  const setAb = (i: 0 | 1, patch: Partial<AbilityOverride>) => {
    const cur: [AbilityOverride, AbilityOverride] = [ab(0), ab(1)];
    cur[i] = { ...cur[i], ...patch };
    set('abilities', cur);
  };

  const fieldBody = (f: EditorField): React.ReactNode => {
    switch (f) {
      case 'colors':
        return (
          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => {
              const on = (ov.colors ?? []).includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  className={cn(
                    'ink-border-sm px-1.5 py-0.5 fs-xs font-black',
                    on ? 'bg-[var(--c-ink)] text-[var(--c-paper)]' : 'bg-[var(--c-paper)]',
                  )}
                  onClick={() =>
                    set(
                      'colors',
                      on
                        ? (ov.colors ?? []).filter((x) => x !== c)
                        : [...(ov.colors ?? []), c as Color],
                    )
                  }
                >
                  {c}
                </button>
              );
            })}
          </div>
        );
      case 'tier':
        return (
          <select
            className={input}
            value={ov.tier ?? ''}
            onChange={(e) => set('tier', Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        );
      case 'effect':
        return (
          <div className="grid grid-cols-[1fr_5rem] gap-1">
            <select
              className={input}
              value={ov.effect?.kw ?? ''}
              onChange={(e) => set('effect', { kw: e.target.value as Keyword })}
            >
              {EFFECT_KEYWORDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="N (tier)"
              aria-label="Effect number"
              value={ov.effect?.n ?? ''}
              onChange={(e) =>
                set('effect', { kw: ov.effect?.kw ?? EFFECT_KEYWORDS[0], n: num(e.target.value) })
              }
            />
          </div>
        );
      case 'mods':
        return (
          <input
            className={input}
            placeholder="Fuse 1, Veil (blank = none)"
            value={modsRaw}
            onChange={(e) => {
              setModsRaw(e.target.value);
              const refs = parseRefs(e.target.value);
              if (refs) set('mods', refs);
            }}
          />
        );
      case 'subtype':
        return (
          <select
            className={input}
            value={ov.subtype ?? ''}
            onChange={(e) => set('subtype', e.target.value as ExtendedOverrides['subtype'])}
          >
            {(SUBTYPES_BY_TYPE[t.type] ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        );
      case 'abilities':
        return (
          <div className="flex flex-col gap-1">
            {([0, 1] as const).map((i) => (
              <div key={i} className="grid grid-cols-[4.5rem_1fr_4rem] gap-1 items-center">
                <input
                  className={input}
                  aria-label={i === 0 ? 'Spend nerve' : 'Build nerve'}
                  value={ab(i)?.nerve ?? ''}
                  onChange={(e) => setAb(i, { nerve: num(e.target.value) ?? 0 })}
                />
                <select
                  className={input}
                  value={ab(i)?.kw ?? ''}
                  onChange={(e) => setAb(i, { kw: e.target.value as Keyword, n: undefined })}
                >
                  {EFFECT_KEYWORDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  placeholder="N"
                  aria-label="Ability number"
                  value={ab(i)?.n ?? ''}
                  onChange={(e) => setAb(i, { n: num(e.target.value) })}
                />
              </div>
            ))}
            <span className="fs-xs font-bold">Nerve: spend −1…−5 first, build +1…+3 second.</span>
          </div>
        );
      case 'rule': {
        const tpl = ov.rule ? LOCATION_TEMPLATES[ov.rule.id] : undefined;
        return (
          <div className="grid grid-cols-[1fr_5rem] gap-1">
            <select
              className={input}
              value={ov.rule?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value as LocationRuleId;
                const params = LOCATION_TEMPLATES[id].params;
                set('rule', params ? { id, param: params[0] } : { id });
              }}
            >
              {(Object.keys(LOCATION_TEMPLATES) as LocationRuleId[]).map((id) => (
                <option key={id} value={id}>
                  {LOCATION_TEMPLATES[id].name}
                </option>
              ))}
            </select>
            {tpl?.params ? (
              <select
                className={input}
                aria-label="Rule parameter"
                value={ov.rule?.param ?? ''}
                onChange={(e) => set('rule', { id: ov.rule!.id, param: Number(e.target.value) })}
              >
                {tpl.params.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <span className="fs-xs font-bold self-center">no param</span>
            )}
          </div>
        );
      }
      case 'text':
        return (
          <textarea
            className={cn(input, 'min-h-[3.5rem]')}
            value={ov.text ?? ''}
            onChange={(e) => set('text', e.target.value)}
          />
        );
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] items-start">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <CardFace def={preview} size="full" />
        <p className="fs-xs font-bold max-w-[16rem] text-center">{preview.text}</p>
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label className={label}>
            ID
            <input
              className={input}
              value={t.id}
              disabled={!idEditable}
              onChange={(e) => setT({ ...t, id: e.target.value.trim() })}
            />
          </label>
          <label className={label}>
            NAME
            <input
              className={input}
              value={t.name}
              onChange={(e) => setT({ ...t, name: e.target.value })}
            />
          </label>
          <label className={label}>
            SET
            <input
              className={input}
              value={t.set ?? ''}
              onChange={(e) => setT({ ...t, set: e.target.value })}
            />
          </label>
          <label className={label}>
            TYPE
            <select
              className={input}
              value={t.type}
              onChange={(e) => setT({ ...t, type: e.target.value as CardType })}
            >
              {CARD_TYPES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            RARITY
            <select
              className={input}
              value={t.rarity ?? 'Common'}
              onChange={(e) => setT({ ...t, rarity: e.target.value as Rarity })}
            >
              {RARITIES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className={cn(label, 'col-span-2 sm:col-span-1')}>
            FLAVOR
            <input
              className={input}
              value={t.flavor ?? ''}
              onChange={(e) => setT({ ...t, flavor: e.target.value })}
            />
          </label>
        </div>

        {reseeded && (
          <Notice
            text={`Changing id, type or rarity reprints the hash: every field kept on "rolled" changes.${
              bundled
                ? ' This card is bundled: run npm run fetch:cards afterwards so verify:pool passes.'
                : ''
            }`}
          />
        )}

        <label className="flex items-center gap-2 fs-xs font-black">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => toggleManual(e.target.checked)}
          />
          MANUAL — skip the automatic roll; every field is chosen by hand
        </label>

        {fields.map((f) => {
          const rolled = (ov as Record<string, unknown>)[f] === undefined;
          return (
            <div key={f} className="ink-border-sm p-2 flex flex-col gap-1">
              <div className="flex items-center gap-2 fs-xs font-black">
                <span>{FIELD_LABEL[f]}</span>
                {!manual && (
                  <label className="ml-auto flex items-center gap-1 font-bold">
                    <input
                      type="checkbox"
                      checked={rolled}
                      onChange={(e) => keepRolled(f, e.target.checked)}
                    />
                    keep rolled
                  </label>
                )}
              </div>
              {rolled && !manual ? (
                <span className="fs-xs font-bold text-[var(--c-steel)]">
                  {f === 'text' ? preview.text : summarize(f, preview)}
                </span>
              ) : (
                fieldBody(f)
              )}
            </div>
          );
        })}

        {engineGap.length > 0 && (
          <Notice
            text={`${engineGap.join(', ')}: saved and shown here, but the game engine does not apply these overrides yet (docs/CARD_SUBMISSIONS.md, "Engine support").`}
          />
        )}
        {problems.length > 0 && (
          <ul className="fs-xs font-bold text-[var(--c-red)] list-disc pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && <Notice text={error} />}
        {notice && <p className="fs-xs font-black">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <PopButton color="black" disabled={busy || problems.length > 0} onClick={save}>
            {busy ? 'SAVING…' : saveLabel}
          </PopButton>
          {onReset && (
            <PopButton color="steel" disabled={busy} onClick={reset}>
              RESET TO ROLLED
            </PopButton>
          )}
        </div>
      </div>
    </div>
  );
}

function summarize(f: EditorField, d: ReturnType<typeof deriveEdited>): string {
  switch (f) {
    case 'colors':
      return d.colors.join(' / ') || 'Colourless';
    case 'tier':
      return isPower(d) ? String(d.tier ?? '') : '';
    case 'effect':
      return d.effect ? formatRefs([d.effect]) : '';
    case 'mods':
      return formatRefs(d.mods ?? []) || 'none';
    case 'subtype':
      return d.subtype ?? '';
    case 'abilities':
      return (d.abilities ?? []).map((a) => a.text).join(' / ');
    case 'rule':
      return d.rule
        ? LOCATION_TEMPLATES[d.rule.id].name + (d.rule.param ? ` ${d.rule.param}` : '')
        : '';
    default:
      return '';
  }
}
