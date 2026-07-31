import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, RefreshCw, Upload, X } from 'lucide-react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice } from './ui';
import { cn } from '../lib/utils';
import { CardFace } from '../components/CardFaceV4';
import { deriveCardMechanics } from '../game/v3/cardpool';
import { CardType, Rarity, RARITIES } from '../types';
import {
  BulkRow,
  DISALLOWED_THEMES,
  SHOWCASE_SET,
  SUBMISSION_LIMITS,
  SUBMITTABLE_TYPES,
  TREATMENT_LABEL,
  Treatment,
  treatmentName,
  buildCardPayload,
  isValidCardId,
  parseBulkCards,
  slugifyCardId,
  validateSubmission,
} from './submissions';
import {
  CardSubmission,
  CardSubmissionForReview,
  ShowcaseStats,
  bulkAddCards,
  fetchMySubmissions,
  fetchShowcaseStats,
  fetchSubmissionsForReview,
  reviewSubmission,
  setSubmissionBan,
  submitCard,
  withdrawSubmission,
} from '../lib/supabase';

/** How many distinct submitters the Showcase wants before the Ultra-Rare
 * community poll is worth running. Display-only — Fry decides. */
const POLL_THRESHOLD = 10;

const input = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs w-full';
const label = 'flex flex-col gap-0.5 text-[9px] font-black text-[var(--c-steel)]';

/** Rarity the live preview prints at, per requested treatment — the player
 * doesn't pick a rarity (Fry does), but the treatment does decide whether the
 * art is framed or full-bleed, which is the thing worth previewing. */
const PREVIEW_RARITY: Record<Treatment, Rarity> = {
  standard: 'Rare',
  full_art: 'Full-Art',
  video_mythic: 'Mythic',
};

const STATUS_CHIP: Record<string, string> = {
  pending: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
  approved: 'bg-[#22C55E] text-[#052E12]',
  denied: 'bg-[var(--c-red)] text-[var(--c-paper)]',
  withdrawn: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'heading-font text-[9px] px-1.5 py-0.5 ink-border-sm shrink-0',
        STATUS_CHIP[status] || STATUS_CHIP.withdrawn,
      )}
    >
      {status.toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Player: submit a card + track your own queue
// ---------------------------------------------------------------------------
function SubmitPanel({ mine, reload }: { mine: CardSubmission[]; reload: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CardType>('Unit');
  const [treatment, setTreatment] = useState<Treatment>('standard');
  const [imageUrl, setImageUrl] = useState('');
  const [flavor, setFlavor] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Held slots are computed from the same rule the server enforces (pending OR
  // approved holds the slot) so the form can disable the option up front
  // instead of letting the player fill it in and be rejected on submit.
  const held = useMemo(() => {
    const active = mine.filter(
      (s) => s.set_name === SHOWCASE_SET && (s.status === 'pending' || s.status === 'approved'),
    );
    return {
      full_art: active.filter((s) => s.requested_treatment === 'full_art').length,
      video_mythic: active.filter((s) => s.requested_treatment === 'video_mythic').length,
      pending: mine.filter((s) => s.status === 'pending').length,
    };
  }, [mine]);

  const treatmentTaken = (t: Treatment) =>
    (t === 'full_art' && held.full_art >= SUBMISSION_LIMITS.fullArtPerAccount) ||
    (t === 'video_mythic' && held.video_mythic >= SUBMISSION_LIMITS.videoMythicPerAccount);

  const draft = { title, type, flavor, imageUrl, treatment };
  const validation = validateSubmission(draft);
  const queueFull = held.pending >= SUBMISSION_LIMITS.maxPending;

  // Preview card. `deriveCardMechanics` is the same assignment every client
  // runs, so what the player sees here is what the card would actually print
  // at that rarity — not a mock-up.
  const preview = useMemo(
    () =>
      deriveCardMechanics({
        id: slugifyCardId(title) || 'preview_card',
        name: title.trim() || 'Your card title',
        type,
        rarity: PREVIEW_RARITY[treatment],
        set: SHOWCASE_SET,
        image: imageUrl.trim(),
        flavor: flavor.trim() || 'Your flavor text lands here.',
      }),
    [title, type, treatment, imageUrl, flavor],
  );

  const submit = async () => {
    if (busy) return;
    if (validation) {
      setError(validation);
      return;
    }
    if (!agreed) {
      setError('Confirm you have read the submission rules first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: err } = await submitCard({
        name: title.trim(),
        type,
        flavor: flavor.trim(),
        imageUrl: imageUrl.trim(),
        treatment,
      });
      if (err) {
        setError(err);
        return;
      }
      setNotice('Submitted — Fry will review it. You can withdraw it until then.');
      setTitle('');
      setImageUrl('');
      setFlavor('');
      setTreatment('standard');
      await reload();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] items-start">
      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3 min-w-0">
        <div className="heading-font text-sm mb-2">SUBMIT A CARD</div>
        <div className="flex flex-col gap-2.5">
          <label className={label}>
            CARD TITLE
            <input
              className={input}
              value={title}
              maxLength={SUBMISSION_LIMITS.titleMax}
              placeholder="e.g. Lantern of the Drowned Choir"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <label className={cn(label, 'flex-1 min-w-[120px]')}>
              CARD TYPE
              <select
                className={input}
                value={type}
                onChange={(e) => setType(e.target.value as CardType)}
              >
                {SUBMITTABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(label, 'flex-1 min-w-[180px]')}>
              TREATMENT
              <select
                className={input}
                value={treatment}
                onChange={(e) => setTreatment(e.target.value as Treatment)}
              >
                {(Object.keys(TREATMENT_LABEL) as Treatment[]).map((t) => (
                  <option key={t} value={t} disabled={treatmentTaken(t)}>
                    {TREATMENT_LABEL[t]}
                    {treatmentTaken(t) ? ' — already used' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={label}>
            ART URL (Midjourney link, https://…)
            <input
              className={input}
              value={imageUrl}
              placeholder="https://cdn.midjourney.com/…/0_0.png"
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </label>
          <label className={label}>
            FLAVOR TEXT ({flavor.trim().length}/{SUBMISSION_LIMITS.flavorMax})
            <textarea
              className={cn(input, 'h-20 resize-y')}
              value={flavor}
              maxLength={SUBMISSION_LIMITS.flavorMax}
              placeholder="One or two lines of story. No rules text — mechanics are assigned by the game."
              onChange={(e) => setFlavor(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-[10px] font-bold">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I have read the submission rules below. My art is my own to submit, and I understand
              that a disallowed submission bans my account from the Showcase.
            </span>
          </label>
          {error && <Notice text={error} />}
          {notice && <Notice text={notice} kind="success" />}
          {queueFull && (
            <Notice
              text={`You already have ${SUBMISSION_LIMITS.maxPending} submissions awaiting review — withdraw one to make room.`}
            />
          )}
          <div className="flex items-center gap-2">
            <PopButton
              color="red"
              disabled={busy || !agreed || !!validation || queueFull}
              onClick={submit}
            >
              {busy ? 'SUBMITTING…' : 'SUBMIT CARD ▸'}
            </PopButton>
            {validation && title.trim() !== '' && (
              <span className="text-[9px] font-bold text-[var(--c-red)]">{validation}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="heading-font text-[10px] text-[var(--c-steel)]">LIVE PREVIEW</div>
        <CardFace def={preview} size="standard" />
        <div className="text-[9px] font-bold text-[var(--c-steel)] max-w-[220px] text-center">
          Stats, cost and keywords are assigned by the game from the card’s id, type and rarity —
          this preview shows the frame, not a promise.
        </div>
      </div>
    </div>
  );
}

function MySubmissions({
  mine,
  reload,
  loading,
  failed,
}: {
  mine: CardSubmission[];
  reload: () => Promise<void>;
  loading: boolean;
  /** The load itself failed — distinct from "you have submitted nothing",
   * which is what an unqualified empty state would claim. */
  failed: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const withdraw = async (id: string) => {
    if (busyId) return;
    if (!confirm('Withdraw this submission? It frees the slot but cannot be undone.')) return;
    setBusyId(id);
    setError('');
    try {
      const err = await withdrawSubmission(id);
      if (err) setError(err);
      else await reload();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
      <div className="heading-font text-sm mb-2">MY SUBMISSIONS ({mine.length})</div>
      {error && (
        <div className="mb-2">
          <Notice text={error} />
        </div>
      )}
      {loading ? (
        <div className="text-[11px] font-bold text-[var(--c-steel)] py-3 animate-pulse">
          Loading your submissions…
        </div>
      ) : failed ? (
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className="text-[11px] font-bold text-[var(--c-red)]">
            Couldn’t load your submissions — this list may be incomplete.
          </span>
          <PopButton color="yellow" onClick={() => reload()}>
            RETRY
          </PopButton>
        </div>
      ) : mine.length === 0 ? (
        <p className="text-[11px] font-bold text-[var(--c-steel)] py-2">
          Nothing submitted yet. Submit as many cards as you like — only the full art and the video
          Mythic are capped.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {mine.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 ink-border-sm px-2 py-1.5 bg-[var(--c-paper)]"
            >
              <StatusChip status={s.status} />
              <span className="text-xs font-black truncate max-w-[220px]">{s.card_name}</span>
              <span className="text-[9px] font-bold text-[var(--c-steel)]">
                {s.card_type} · {treatmentName(s.requested_treatment)}
              </span>
              {s.approved_rarity && (
                <span className="text-[9px] font-black text-[var(--c-ink)]">
                  PRINTED AS {s.approved_rarity.toUpperCase()}
                </span>
              )}
              {s.review_note && (
                <span className="text-[9px] font-bold text-[var(--c-red)] basis-full">
                  Fry says: {s.review_note}
                </span>
              )}
              {s.status === 'pending' && (
                <PopButton
                  color="steel"
                  className="ml-auto"
                  disabled={busyId === s.id}
                  onClick={() => withdraw(s.id)}
                >
                  {busyId === s.id ? 'WITHDRAWING…' : 'WITHDRAW'}
                </PopButton>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RulesPanel({ stats }: { stats: ShowcaseStats | null }) {
  const submitters = stats?.submitters ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
        <div className="heading-font text-sm mb-2">HOW THE SHOWCASE WORKS</div>
        <ul className="text-[11px] font-bold text-[var(--c-ink)] flex flex-col gap-1.5 list-disc pl-4">
          <li>
            Submit as many cards as you like. Every approved card is printed into the{' '}
            <strong>{SHOWCASE_SET}</strong> set — a real, collectible, deck-legal card.
          </li>
          <li>
            <strong>One full art per account, per set.</strong> Same for the{' '}
            <strong>video Mythic</strong> — one each. A pending request holds the slot; withdraw it
            to free it.
          </li>
          <li>
            You provide the art link, the title, the card type and the flavor text.{' '}
            <strong>Fry picks the rarity and every other attribute at his own discretion</strong>,
            and can deny any submission for any reason.
          </li>
          <li>
            Mechanics — cost, Might/Grit, keywords — are assigned by the game from the card’s id,
            type and rarity. Nobody, including Fry, hand-writes them.
          </li>
          <li>
            A video Mythic needs an <code>.mp4</code>, <code>.webm</code> or <code>.mov</code> link;
            everything else needs a still image.
          </li>
        </ul>
      </div>

      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-yellow)] p-3">
        <div className="heading-font text-sm mb-1">COMMUNITY ULTRA-RARE POLL</div>
        <p className="text-[11px] font-bold">
          If enough players submit, Fry will pick a shortlist of his favourites and put them to a
          community poll — the winners are printed at <strong>Ultra-Rare</strong>. It runs at Fry’s
          discretion once the Showcase has the submitters to make a vote meaningful.
        </p>
        <p className="text-[10px] font-black mt-1.5">
          {submitters} player{submitters === 1 ? '' : 's'} {submitters === 1 ? 'has' : 'have'}{' '}
          submitted so far
          {submitters < POLL_THRESHOLD
            ? ` — around ${POLL_THRESHOLD} is where a poll starts being worth running.`
            : ' — that’s enough for a poll whenever Fry calls it.'}
        </p>
      </div>

      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-red)] text-[var(--c-paper)] p-3">
        <div className="heading-font text-sm mb-1 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> DISALLOWED — INSTANT BAN
        </div>
        <p className="text-[11px] font-bold mb-1.5">
          These are not denials, they are bans. Submitting any of the following removes your account
          from the Showcase permanently and clears the rest of your queue:
        </p>
        <ul className="text-[11px] font-bold flex flex-col gap-1 list-disc pl-4">
          {DISALLOWED_THEMES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="text-[10px] font-bold mt-2 opacity-90">
          Borderline is not a defence. If you have to ask whether it qualifies, it does.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creator: review queue
// ---------------------------------------------------------------------------
function ReviewCard({
  sub,
  onDone,
}: {
  key?: React.Key;
  sub: CardSubmissionForReview;
  onDone: () => Promise<void>;
}) {
  const [cardId, setCardId] = useState(() => slugifyCardId(sub.card_name));
  const [rarity, setRarity] = useState<Rarity>(
    sub.requested_treatment === 'video_mythic'
      ? 'Mythic'
      : sub.requested_treatment === 'full_art'
        ? 'Full-Art'
        : 'Common',
  );
  const [name, setName] = useState(sub.card_name);
  const [type, setType] = useState<CardType>(sub.card_type as CardType);
  const [flavor, setFlavor] = useState(sub.flavor_text);
  const [imageUrl, setImageUrl] = useState(sub.image_url);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const preview = useMemo(
    () =>
      deriveCardMechanics({
        id: cardId || 'preview_card',
        name: name.trim() || sub.card_name,
        type,
        rarity,
        set: sub.set_name,
        image: imageUrl.trim(),
        flavor: flavor.trim(),
      }),
    [cardId, name, type, rarity, sub.set_name, sub.card_name, imageUrl, flavor],
  );

  const idOk = isValidCardId(cardId);

  const act = async (action: 'approve' | 'deny' | 'deny_ban') => {
    if (busy) return;
    if (action === 'approve' && !idOk) {
      setError('Card id must be 3–64 characters of a-z, 0-9 or _.');
      return;
    }
    if (
      action === 'deny_ban' &&
      !confirm(
        `Ban ${sub.submitter_username || 'this player'} from the Showcase and deny every pending submission they have?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload =
        action === 'approve'
          ? buildCardPayload({
              id: cardId,
              name: name.trim(),
              type,
              rarity,
              set: sub.set_name,
              flavor: flavor.trim(),
              image: imageUrl.trim(),
            })
          : null;
      const { error: err } = await reviewSubmission({
        id: sub.id,
        action,
        note: note.trim() || null,
        cardId: payload?.id ?? null,
        rarity: payload?.rarity ?? null,
        name: payload?.name ?? null,
        type: payload?.card_type ?? null,
        flavor: payload?.flavor_text ?? null,
        imageUrl: payload?.image_url ?? null,
        mechanics: payload?.mechanics ?? null,
      });
      if (err) {
        setError(err);
        return;
      }
      setNotice(action === 'approve' ? 'Printed into the set.' : 'Denied.');
      await onDone();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <StatusChip status={sub.status} />
        <span className="text-xs font-black">{sub.card_name}</span>
        <span className="text-[9px] font-bold text-[var(--c-steel)]">
          by {sub.submitter_username || 'unknown'} · asked for{' '}
          {treatmentName(sub.requested_treatment).toLowerCase()} ·{' '}
          {new Date(sub.created_at).toLocaleDateString()}
        </span>
        {sub.submitter_banned && (
          <span className="heading-font text-[9px] px-1.5 py-0.5 ink-border-sm bg-[var(--c-ink)] text-[var(--c-red)]">
            BANNED
          </span>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] items-start">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <CardFace def={preview} size="standard" />
          <a
            href={sub.image_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[9px] font-bold underline text-[var(--c-steel)] max-w-[220px] truncate"
          >
            open art source ↗
          </a>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <label className={cn(label, 'flex-1 min-w-[160px]')}>
              CARD ID (hash seed — can never change after printing)
              <input className={input} value={cardId} onChange={(e) => setCardId(e.target.value)} />
            </label>
            <label className={cn(label, 'w-32')}>
              RARITY
              <select
                className={input}
                value={rarity}
                onChange={(e) => setRarity(e.target.value as Rarity)}
              >
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(label, 'w-32')}>
              TYPE
              <select
                className={input}
                value={type}
                onChange={(e) => setType(e.target.value as CardType)}
              >
                {SUBMITTABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!idOk && (
            <div className="text-[9px] font-bold text-[var(--c-red)]">
              Card id must be 3–64 characters of a-z, 0-9 or _.
            </div>
          )}
          <label className={label}>
            NAME
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={label}>
            ART URL
            <input
              className={input}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </label>
          <label className={label}>
            FLAVOR
            <textarea
              className={cn(input, 'h-16 resize-y')}
              value={flavor}
              onChange={(e) => setFlavor(e.target.value)}
            />
          </label>
          <label className={label}>
            NOTE TO THE PLAYER (shown on denial)
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="text-[9px] font-bold text-[var(--c-steel)] break-words">
            Derived: {preview.keywords?.join(', ') || 'no keywords'} ·{' '}
            {preview.might != null ? `${preview.might}/${preview.grit}` : 'no stats'} ·{' '}
            {preview.text || 'no rules text'}
          </div>

          {error && <Notice text={error} />}
          {notice && <Notice text={notice} kind="success" />}

          <div className="flex flex-wrap gap-2">
            <PopButton color="red" disabled={busy || !idOk} onClick={() => act('approve')}>
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> APPROVE AS {rarity.toUpperCase()}
              </span>
            </PopButton>
            <PopButton color="steel" disabled={busy} onClick={() => act('deny')}>
              <span className="flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> DENY
              </span>
            </PopButton>
            <PopButton color="black" disabled={busy} onClick={() => act('deny_ban')}>
              <span className="flex items-center gap-1">
                <Ban className="w-3.5 h-3.5" /> DENY + BAN
              </span>
            </PopButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewQueue() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [rows, setRows] = useState<CardSubmissionForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unbanning, setUnbanning] = useState<string | null>(null);

  // Sequence guard rather than a per-effect `cancelled` flag: `reload` is
  // called both from the filter effect and from every approve/deny, so two
  // fetches can legitimately be in flight and only the newest may write.
  const seq = React.useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchSubmissionsForReview(status === 'all' ? null : status);
      if (seq.current === mine) setRows(data);
    } catch {
      if (seq.current === mine) {
        setError('Could not load the review queue — check your connection and try again.');
      }
    } finally {
      if (seq.current === mine) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    reload();
  }, [reload]);

  const lift = async (userId: string) => {
    if (unbanning) return;
    setUnbanning(userId);
    try {
      const err = await setSubmissionBan(userId, false);
      if (err) setError(err);
      else await reload();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setUnbanning(null);
    }
  };

  const banned = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows)
      if (r.submitter_banned) seen.set(r.submitter, r.submitter_username || '?');
    return [...seen.entries()];
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['pending', 'approved', 'denied', 'all'] as const).map((s) => (
          <PopButton
            key={s}
            color={status === s ? 'black' : 'steel'}
            ariaPressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s.toUpperCase()}
          </PopButton>
        ))}
        <PopButton color="yellow" onClick={reload} disabled={loading}>
          <span className="flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> REFRESH
          </span>
        </PopButton>
      </div>

      {banned.length > 0 && (
        <div className="ink-border-sm bg-[var(--c-ink)] text-[var(--c-paper)] p-2 flex flex-wrap items-center gap-2">
          <span className="heading-font text-[10px] text-[var(--c-red)]">BANNED SUBMITTERS</span>
          {banned.map(([id, username]) => (
            <PopButton key={id} color="steel" disabled={unbanning === id} onClick={() => lift(id)}>
              {unbanning === id ? 'LIFTING…' : `LIFT BAN: ${username}`}
            </PopButton>
          ))}
        </div>
      )}

      {error && <Notice text={error} />}
      {/* `error ? null` below is deliberate: a failed load must not ALSO render
          the "No pending submissions" empty state, which reads as "nothing to
          review" when the truth is "we could not look". */}
      {loading ? (
        <div className="text-[11px] font-bold text-[var(--c-steel)] py-6 animate-pulse">
          Loading submissions…
        </div>
      ) : error ? null : rows.length === 0 ? (
        <p className="text-[11px] font-bold text-[var(--c-steel)] py-6">
          No {status === 'all' ? '' : status} submissions.
        </p>
      ) : (
        rows.map((r) =>
          r.status === 'pending' ? (
            <ReviewCard key={r.id} sub={r} onDone={reload} />
          ) : (
            <div
              key={r.id}
              className="ink-border-sm bg-[var(--c-paper)] px-2 py-1.5 flex flex-wrap items-center gap-2"
            >
              <StatusChip status={r.status} />
              <span className="text-xs font-black">{r.card_name}</span>
              <span className="text-[9px] font-bold text-[var(--c-steel)]">
                by {r.submitter_username || 'unknown'}
                {r.approved_rarity ? ` · printed ${r.approved_rarity}` : ''}
                {r.review_note ? ` · “${r.review_note}”` : ''}
              </span>
            </div>
          ),
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creator: bulk add
// ---------------------------------------------------------------------------
const BULK_EXAMPLE = `Ashen Kite | Unit | Uncommon | https://cdn.midjourney.com/x/0_0.png | It circles what the fire left.
Tidewrack Reliquary | Location | Rare | https://cdn.midjourney.com/x/0_1.png | Every shelf is a drowned promise.`;

export function BulkAddPanel() {
  const [text, setText] = useState('');
  const [setName, setSetName] = useState(SHOWCASE_SET);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string>('');
  const [serverErrors, setServerErrors] = useState<{ row: number; id: string; message: string }[]>(
    [],
  );

  const parsed = useMemo(() => parseBulkCards(text, setName.trim()), [text, setName]);
  const canSend = parsed.rows.length > 0 && !busy;

  const send = async () => {
    if (!canSend) return;
    if (
      !confirm(
        `Add ${parsed.rows.length} card${parsed.rows.length === 1 ? '' : 's'} to "${setName.trim()}"?` +
          (overwrite ? ' Existing ids will be OVERWRITTEN.' : ''),
      )
    )
      return;
    setBusy(true);
    setError('');
    setResult('');
    setServerErrors([]);
    try {
      const payload = parsed.rows.map((r: BulkRow) =>
        buildCardPayload({
          id: r.id,
          name: r.name,
          type: r.type,
          rarity: r.rarity,
          set: r.set,
          flavor: r.flavor,
          image: r.image,
        }),
      );
      const { data, error: err } = await bulkAddCards(payload, overwrite);
      if (err || !data) {
        setError(err || 'Bulk add failed.');
        return;
      }
      setResult(
        `${data.inserted} inserted · ${data.updated} updated · ${data.failed} failed. ` +
          'Reload the app to see new cards in the pool.',
      );
      setServerErrors(data.errors || []);
      if (data.failed === 0) setText('');
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
        <div className="heading-font text-sm mb-1 flex items-center gap-1.5">
          <Upload className="w-4 h-4" /> BULK ADD CARDS
        </div>
        <p className="text-[10px] font-bold text-[var(--c-steel)] mb-2">
          Paste a JSON array, or one card per line as{' '}
          <code>name | type | rarity | image url | flavor</code> (optional 6th column: set, 7th:
          card id). Tabs and pipes beat commas — flavor text is full of commas. Ids default to a
          slug of the name. Mechanics are derived here, in the client, with the same code the game
          uses, then written alongside the row.
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          <label className={cn(label, 'w-56')}>
            SET NAME
            <input className={input} value={setName} onChange={(e) => setSetName(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-black pb-1.5 self-end">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            OVERWRITE EXISTING IDS
          </label>
          <PopButton
            color="steel"
            className="self-end"
            onClick={() => setText(BULK_EXAMPLE)}
            disabled={busy}
          >
            LOAD EXAMPLE
          </PopButton>
        </div>
        <textarea
          className={cn(input, 'h-44 resize-y font-mono')}
          value={text}
          placeholder={BULK_EXAMPLE}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <PopButton color="red" disabled={!canSend} onClick={send}>
            {busy
              ? 'ADDING…'
              : `ADD ${parsed.rows.length} CARD${parsed.rows.length === 1 ? '' : 'S'} ▸`}
          </PopButton>
          <span className="text-[10px] font-bold text-[var(--c-steel)]">
            {parsed.rows.length} ready · {parsed.errors.length} rejected
          </span>
        </div>
        {error && (
          <div className="mt-2">
            <Notice text={error} />
          </div>
        )}
        {result && (
          <div className="mt-2">
            <Notice text={result} kind="success" />
          </div>
        )}
      </div>

      {parsed.errors.length > 0 && (
        <div className="ink-border-sm bg-[var(--c-red)] text-[var(--c-paper)] p-2">
          <div className="heading-font text-[10px] mb-1">REJECTED BEFORE SENDING</div>
          <ul className="text-[10px] font-bold flex flex-col gap-0.5">
            {parsed.errors.slice(0, 40).map((e, i) => (
              <li key={i}>
                {e.line > 0 ? `line ${e.line}: ` : ''}
                {e.message}
              </li>
            ))}
            {parsed.errors.length > 40 && <li>…and {parsed.errors.length - 40} more</li>}
          </ul>
        </div>
      )}

      {serverErrors.length > 0 && (
        <div className="ink-border-sm bg-[var(--c-red)] text-[var(--c-paper)] p-2">
          <div className="heading-font text-[10px] mb-1">REJECTED BY THE SERVER</div>
          <ul className="text-[10px] font-bold flex flex-col gap-0.5">
            {serverErrors.map((e, i) => (
              <li key={i}>
                row {e.row} ({e.id || 'no id'}): {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.rows.length > 0 && (
        <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
          <div className="heading-font text-sm mb-2">PREVIEW ({parsed.rows.length})</div>
          <div className="flex flex-wrap gap-3">
            {parsed.rows.slice(0, 24).map((r) => (
              <CardFace
                key={r.id}
                def={deriveCardMechanics({
                  id: r.id,
                  name: r.name,
                  type: r.type,
                  rarity: r.rarity,
                  set: r.set,
                  image: r.image,
                  flavor: r.flavor,
                })}
                size="compact"
              />
            ))}
          </div>
          {parsed.rows.length > 24 && (
            <div className="text-[10px] font-bold text-[var(--c-steel)] mt-2">
              …and {parsed.rows.length - 24} more (all of them will be sent).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CardSubmissionsScreen({ onBack }: { onBack: () => void }) {
  const { session, profile } = useMeta();
  const userId = session?.user?.id;
  const isCreator = profile?.role === 'creator';
  const [tab, setTab] = useState<'submit' | 'review' | 'bulk'>('submit');
  const [mine, setMine] = useState<CardSubmission[]>([]);
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Same sequence guard as the review queue: `reload` runs on mount and after
  // every submit/withdraw, so only the newest response may write state.
  const seq = React.useRef(0);
  const reload = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const call = ++seq.current;
    setLoading(true);
    setLoadError('');
    try {
      const [subs, s] = await Promise.all([fetchMySubmissions(userId), fetchShowcaseStats()]);
      if (seq.current !== call) return;
      setMine(subs);
      setStats(s);
    } catch {
      if (seq.current === call) {
        setLoadError('Could not load your submissions — check your connection and try again.');
      }
    } finally {
      if (seq.current === call) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const banned = !!profile?.submissions_banned;

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="PLAYER SHOWCASE" onBack={onBack} />
      <div className="p-4 sm:p-5 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <PopButton
            color={tab === 'submit' ? 'black' : 'steel'}
            ariaPressed={tab === 'submit'}
            onClick={() => setTab('submit')}
          >
            SUBMIT A CARD
          </PopButton>
          {isCreator && (
            <>
              <PopButton
                color={tab === 'review' ? 'black' : 'steel'}
                ariaPressed={tab === 'review'}
                onClick={() => setTab('review')}
              >
                REVIEW QUEUE
              </PopButton>
              <PopButton
                color={tab === 'bulk' ? 'black' : 'steel'}
                ariaPressed={tab === 'bulk'}
                onClick={() => setTab('bulk')}
              >
                BULK ADD
              </PopButton>
            </>
          )}
          {stats && (
            <span className="ml-auto text-[10px] font-bold text-[var(--c-steel)]">
              {stats.printed} printed · {stats.pending} awaiting review · {stats.submitters}{' '}
              submitter{stats.submitters === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {tab === 'submit' && (
          <>
            {/* Scoped to this tab: it reports the failure of the caller's OWN
                submissions fetch, which has nothing to say about the review
                queue or the bulk importer. */}
            {loadError && <Notice text={loadError} />}
            {banned ? (
              <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-red)] text-[var(--c-paper)] p-4">
                <div className="heading-font text-base mb-1 flex items-center gap-1.5">
                  <Ban className="w-4 h-4" /> SUBMISSIONS DISABLED
                </div>
                <p className="text-[11px] font-bold">
                  This account is banned from the Player Showcase.
                  {profile?.submissions_ban_reason
                    ? ` Reason: ${profile.submissions_ban_reason}`
                    : ''}{' '}
                  Everything else in the game is unaffected.
                </p>
              </div>
            ) : (
              <SubmitPanel mine={mine} reload={reload} />
            )}
            <MySubmissions mine={mine} reload={reload} loading={loading} failed={!!loadError} />
            <RulesPanel stats={stats} />
          </>
        )}

        {tab === 'review' && isCreator && <ReviewQueue />}
        {tab === 'bulk' && isCreator && <BulkAddPanel />}
      </div>
    </div>
  );
}
