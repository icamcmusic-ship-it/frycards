import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMeta } from './MetaContext';
import { PopButton, Notice } from './ui';

/**
 * Account creation / sign-in. Also offers Guest Mode: play vs the CPU with
 * prebuilt decks, no collection or persistence.
 */
export function AuthScreen() {
  const { setGuest } = useMeta();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const oauthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
    },
    [],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (username.trim().length < 3) {
          setError('Pick an operative name (3+ characters).');
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        });
        if (error) setError(error.message);
        else if (!data.session)
          setInfo('Account created! Check your email to confirm, then sign in.');
        // if a session was returned, onAuthStateChange takes it from here
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      }
    } catch {
      // A thrown rejection (offline/timeout) previously produced no message
      // at all — the form just silently un-busied.
      setError('Could not reach the server — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const signInWithDiscord = async () => {
    setError('');
    setBusy(true);
    let error: { message: string } | null;
    try {
      ({ error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        // window.location.origin alone drops the GitHub Pages project subpath
        // (e.g. /frycards/) — BASE_URL restores it, so the redirect lands back
        // on the app itself instead of the bare domain root.
        options: { redirectTo: window.location.origin + (import.meta as any).env.BASE_URL },
      }));
    } catch {
      // A thrown rejection (offline/timeout) previously escaped this handler
      // entirely — no message, and `busy` stayed true forever, locking every
      // button on the form (the email submit path already caught this case).
      error = { message: 'Could not reach the server — check your connection and try again.' };
    }
    if (error) {
      setError(error.message);
      setBusy(false);
    } else {
      // On success the browser normally redirects to Discord immediately;
      // onAuthStateChange picks the session up when we land back on the
      // app. But if the redirect is blocked (popup blocker, browser
      // extension) the call resolves with no error and nothing else ever
      // fires — without this fallback the button stays stuck disabled
      // forever. Give the real redirect a window, then release the button.
      oauthTimeoutRef.current = setTimeout(() => setBusy(false), 4000);
    }
  };

  const input =
    'w-full px-3 py-2.5 bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm font-bold text-sm placeholder:text-[var(--c-steel)]/50 focus:outline-none focus:shadow-hard-black-xs';

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] flex items-center justify-center p-6 relative overflow-hidden text-[var(--c-ink)]">
      <div
        className="absolute inset-0 bg-[var(--c-steel)] pointer-events-none opacity-15"
        style={{ clipPath: 'polygon(0 0, 55% 0, 30% 100%, 0% 100%)' }}
      />
      <div
        className="absolute inset-0 bg-[var(--c-yellow)] pointer-events-none"
        style={{ clipPath: 'polygon(88% 0, 100% 0, 100% 100%, 75% 100%)' }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="bg-[var(--c-red)] text-[var(--c-paper)] px-3 py-1 heading-font text-xs ink-border-sm shadow-hard-black-xs inline-block mb-3">
            VOLUME #1 · OPERATIVE TERMINAL
          </div>
          <h1 className="text-4xl heading-font leading-none">
            FRY
            <br />
            <span className="bg-[var(--c-ink)] text-[var(--c-yellow)] px-3 py-1 inline-block mt-1">
              CARDS
            </span>
          </h1>
        </div>

        <form
          onSubmit={submit}
          className="bg-[var(--c-paper)] ink-border-md shadow-hard-black p-6 flex flex-col gap-3"
        >
          <div className="flex gap-2 mb-1">
            <PopButton
              color={mode === 'signin' ? 'black' : 'yellow'}
              onClick={() => {
                setMode('signin');
                setError('');
                setInfo('');
              }}
              className="flex-1"
            >
              SIGN IN
            </PopButton>
            <PopButton
              color={mode === 'signup' ? 'black' : 'yellow'}
              onClick={() => {
                setMode('signup');
                setError('');
                setInfo('');
              }}
              className="flex-1"
            >
              CREATE ACCOUNT
            </PopButton>
          </div>

          {mode === 'signup' && (
            <input
              className={input}
              placeholder="Operative name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={24}
            />
          )}
          <input
            className={input}
            type="email"
            placeholder="Email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="relative">
            <input
              className={input + ' pr-10'}
              type={showPassword ? 'text' : 'password'}
              placeholder="Password (6+ characters)"
              value={password}
              required
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-steel)] hover:text-[var(--c-ink)]"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && <Notice text={error} />}
          {info && <Notice text={info} kind="success" />}

          <button
            type="submit"
            disabled={busy}
            className="btn-pop w-full py-3 bg-[var(--c-red)] text-[var(--c-paper)] heading-font ink-border-sm shadow-hard-black-xs disabled:opacity-50"
          >
            {busy ? 'CONTACTING FRYCARDS…' : mode === 'signin' ? 'ENTER FRYCARDS' : 'FORGE ACCOUNT'}
          </button>

          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-0.5 bg-[var(--c-ink)]/20" />
            <span className="text-[10px] font-black text-[var(--c-steel)]">OR</span>
            <div className="flex-1 h-0.5 bg-[var(--c-ink)]/20" />
          </div>

          <button
            type="button"
            onClick={signInWithDiscord}
            disabled={busy}
            className="btn-pop w-full py-3 bg-[#5865F2] text-[var(--c-paper)] heading-font ink-border-sm shadow-hard-black-xs disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            SIGN IN WITH DISCORD
          </button>

          <div className="text-center text-[10px] font-bold text-[var(--c-steel)] mt-1">
            New accounts start with a stash of credits and vouchers — open packs in the Store to get
            your first cards.
          </div>
        </form>

        <div className="text-center mt-4">
          <button
            onClick={() => setGuest(true)}
            className="btn-pop px-6 py-2 bg-[var(--c-steel)] text-[var(--c-paper)] heading-font text-xs ink-border-sm shadow-hard-black-xs"
          >
            PLAY AS GUEST (NO SAVING)
          </button>
        </div>
      </div>
    </div>
  );
}
