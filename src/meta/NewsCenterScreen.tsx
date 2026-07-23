import React, { useEffect, useState } from 'react';
import { Sparkles, ScrollText, Newspaper, Trash2 } from 'lucide-react';
import { MetaHeader } from './ui';
import { useMeta } from './MetaContext';
import {
  fetchNewsPosts,
  fetchSerializedFeed,
  NewsPost,
  SerializedFeedEntry,
  createNewsPost,
  deleteNewsPost,
} from '../lib/supabase';
import { RARITY_CHIP } from './rarity';
import { SafeImage } from './SafeImage';

/** Mirrors ChangelogScreen's newest entry headline — kept as a short pointer
 * here rather than duplicating the full log (see ChangelogScreen.tsx). */
const LATEST_UPDATE_HEADLINE =
  'Convergence Update — Volume #1 set, store rework, watchable CPU turns, card readability overhaul & app-wide bug hunt';

function timeAgo(iso: string | null | undefined): string {
  const ms = iso ? Date.now() - new Date(iso).getTime() : NaN;
  if (Number.isNaN(ms)) return 'recently';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function NewsCenterScreen({
  onBack,
  onOpenChangelog,
}: {
  onBack: () => void;
  onOpenChangelog: () => void;
}) {
  const { profile } = useMeta();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [feed, setFeed] = useState<SerializedFeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Load and publish errors are separate slots — they used to share one
  // `err` state, so a fetch failure leaked into the composer as a bogus
  // publish error, and a stale publish error resurfaced as a load-failure
  // banner (with a useless RETRY button) after closing the composer.
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // A rejected fetch (network failure) here used to leave `loading` stuck
  // true forever — the .then() callback never ran, `setLoading(false)` never
  // fired, and both sections just rendered blank with no loading indicator
  // and no way to tell it had failed.
  const load = () => {
    setLoading(true);
    Promise.all([fetchNewsPosts(), fetchSerializedFeed()])
      .then(([p, f]) => {
        setPosts(p);
        setFeed(f);
        setLoadErr(null);
      })
      .catch(() => {
        // Leave posts/feed as whatever they were — the empty-state copy
        // below at least still renders something instead of a silent blank
        // section with no explanation and no way to retry.
        setLoadErr("Couldn't load the news feed. Check your connection.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const isCreator = profile?.role === 'creator';

  const handleDeletePost = async (id: string) => {
    if (deletingId) return;
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const err = await deleteNewsPost(id);
      if (err) setLoadErr(err);
      else load();
    } catch {
      setLoadErr("Couldn't delete — check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="NEWS CENTER" onBack={onBack} />

      <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
        {/* Load failure — its own dedicated slot, visible to every player
            whether or not a creator has the composer open. */}
        {loadErr && (
          <div className="ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)] px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] font-bold text-[var(--c-red)]">{loadErr}</span>
            <button
              onClick={load}
              className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2.5 py-1 ink-border-sm shadow-hard-black-xs shrink-0"
            >
              RETRY
            </button>
          </div>
        )}

        {/* Changelog pointer */}
        <button
          onClick={onOpenChangelog}
          className="btn-pop w-full text-left flex items-center gap-3 bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-black-xs px-5 py-4"
        >
          <ScrollText className="w-6 h-6 text-[var(--c-yellow)] shrink-0" />
          <div className="min-w-0">
            <div className="heading-font text-sm text-[var(--c-yellow)]">LATEST UPDATE</div>
            <div className="text-[12px] font-bold truncate">{LATEST_UPDATE_HEADLINE}</div>
          </div>
          <span className="ml-auto heading-font text-[11px] text-[var(--c-yellow)] shrink-0">
            FULL CHANGELOG &gt;
          </span>
        </button>

        {/* Blog posts */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="heading-font text-lg flex items-center gap-2">
              <Newspaper className="w-5 h-5" /> DEV BLOG
            </h2>
            {isCreator && (
              <button
                onClick={() => {
                  // Don't carry a stale publish error — or an abandoned
                  // draft's title/body — into the next open/close of the
                  // composer.
                  setPublishErr(null);
                  if (composing) {
                    setTitle('');
                    setBody('');
                  }
                  setComposing((c) => !c);
                }}
                disabled={publishing}
                className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2.5 py-1 ink-border-sm shadow-hard-black-xs disabled:opacity-40"
              >
                {composing ? 'CANCEL' : '+ NEW POST'}
              </button>
            )}
          </div>

          {composing && (
            <div className="ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)] p-3 mb-3 flex flex-col gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="border-2 border-[var(--c-ink)] px-2 py-1.5 text-sm font-bold"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What's new…"
                rows={4}
                className="border-2 border-[var(--c-ink)] px-2 py-1.5 text-sm"
              />
              {publishErr && (
                <div className="text-[11px] font-bold text-[var(--c-red)]">{publishErr}</div>
              )}
              <button
                onClick={async () => {
                  if (publishing) return;
                  setPublishErr(null);
                  setPublishing(true);
                  try {
                    const e = await createNewsPost(title.trim(), body.trim());
                    if (e) {
                      setPublishErr(e);
                      return;
                    }
                    setTitle('');
                    setBody('');
                    setComposing(false);
                    load();
                  } catch {
                    // A thrown rejection (offline/timeout) previously escaped
                    // this handler entirely — no message, just a silent no-op.
                    setPublishErr("Couldn't publish — check your connection and try again.");
                  } finally {
                    setPublishing(false);
                  }
                }}
                disabled={!title.trim() || !body.trim() || publishing}
                className="btn-pop heading-font text-xs bg-[var(--c-red)] text-white px-3 py-1.5 ink-border-sm shadow-hard-black-xs self-start disabled:opacity-40"
              >
                {publishing ? 'PUBLISHING…' : 'PUBLISH'}
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center font-bold text-[var(--c-steel)] py-8 animate-pulse text-[12px]">
              LOADING…
            </div>
          )}
          {!loading && posts.length === 0 && (
            <div className="text-[12px] font-bold text-[var(--c-steel)] px-1">
              No posts yet — check back soon.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {posts.map((p) => (
              <div
                key={p.id}
                className="ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="heading-font text-sm">{p.title}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-[var(--c-steel)]">
                      {timeAgo(p.published_at)}
                    </span>
                    {isCreator && (
                      <button
                        onClick={() => handleDeletePost(p.id)}
                        disabled={deletingId !== null}
                        aria-label={`Delete post "${p.title}"`}
                        title="Delete post"
                        className="text-[var(--c-steel)] hover:text-[var(--c-red)] disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[12px] font-medium mt-1.5 whitespace-pre-wrap leading-snug">
                  {p.body}
                </p>
                <div className="text-[10px] font-bold text-[var(--c-steel)] mt-2">— {p.author}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Serialized feed */}
        <section>
          <h2 className="heading-font text-lg flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-[var(--c-yellow)]" /> SERIALIZED PULLS
          </h2>
          <p className="text-[11px] font-bold text-[var(--c-steel)] mb-2">
            Every Serialized card pulled anywhere on the server, newest first. Turn off username
            recognition in Settings if you'd rather show up as "A collector."
          </p>
          {!loading && feed.length === 0 && (
            <div className="text-[12px] font-bold text-[var(--c-steel)] px-1">
              No Serialized cards pulled yet — someone has to be first.
            </div>
          )}
          <div className="flex flex-col gap-2">
            {feed.map((f) => (
              <div
                key={`${f.card_id}-${f.rarity}-${f.serial_number}`}
                className="flex items-center gap-3 ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)] px-3 py-2"
              >
                {f.image_url && (
                  <div className="w-9 h-9 rounded-[2px] border-2 border-[var(--c-ink)] shrink-0 overflow-hidden">
                    <SafeImage
                      src={f.image_url}
                      alt={f.card_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold truncate">
                    <span className="text-[var(--c-red)]">{f.username}</span> pulled{' '}
                    <span className="font-black">{f.card_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${RARITY_CHIP[f.rarity] || ''}`}
                    >
                      {f.rarity}
                    </span>
                    <span className="serial-plate text-[9px] font-black px-1.5 py-0.5 rounded-full">
                      #{f.serial_number}/{f.cap}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--c-steel)]">
                      {timeAgo(f.acquired_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
