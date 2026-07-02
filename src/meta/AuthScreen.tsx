import React, { useState } from 'react';
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
        else if (!data.session) setInfo('Account created! Check your email to confirm, then sign in.');
        // if a session was returned, onAuthStateChange takes it from here
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3 py-2.5 bg-[#F7F7F7] text-[#1A1A1A] ink-border-sm font-bold text-sm placeholder:text-[#2C3E50]/50 focus:outline-none focus:shadow-hard-black-xs';

  return (
    <div className="w-full min-h-screen bg-[#F7F7F7] flex items-center justify-center p-6 relative overflow-hidden text-[#1A1A1A]">
      <div className="absolute inset-0 bg-[#2C3E50] pointer-events-none opacity-15" style={{ clipPath: 'polygon(0 0, 55% 0, 30% 100%, 0% 100%)' }} />
      <div className="absolute inset-0 bg-[#FFD54F] pointer-events-none" style={{ clipPath: 'polygon(88% 0, 100% 0, 100% 100%, 75% 100%)' }} />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="bg-[#E53935] text-[#F7F7F7] px-3 py-1 heading-font text-xs ink-border-sm shadow-hard-black-xs inline-block mb-3">
            BLUE CORAL SET · OPERATIVE TERMINAL
          </div>
          <h1 className="text-4xl heading-font leading-none">
            SHIFTING<br /><span className="bg-[#1A1A1A] text-[#FFD54F] px-3 py-1 inline-block mt-1">MULTIVERSE TCG</span>
          </h1>
        </div>

        <form onSubmit={submit} className="bg-[#F7F7F7] ink-border-md shadow-hard-black p-6 flex flex-col gap-3">
          <div className="flex gap-2 mb-1">
            <PopButton color={mode === 'signin' ? 'black' : 'yellow'} onClick={() => { setMode('signin'); setError(''); }} className="flex-1">
              SIGN IN
            </PopButton>
            <PopButton color={mode === 'signup' ? 'black' : 'yellow'} onClick={() => { setMode('signup'); setError(''); }} className="flex-1">
              CREATE ACCOUNT
            </PopButton>
          </div>

          {mode === 'signup' && (
            <input className={input} placeholder="Operative name" value={username}
              onChange={(e) => setUsername(e.target.value)} maxLength={24} />
          )}
          <input className={input} type="email" placeholder="Email" value={email} required
            onChange={(e) => setEmail(e.target.value)} />
          <input className={input} type="password" placeholder="Password (6+ characters)" value={password} required minLength={6}
            onChange={(e) => setPassword(e.target.value)} />

          {error && <Notice text={error} />}
          {info && <Notice text={info} kind="success" />}

          <button type="submit" disabled={busy}
            className="btn-pop w-full py-3 bg-[#E53935] text-[#F7F7F7] heading-font ink-border-sm shadow-hard-black-xs disabled:opacity-50">
            {busy ? 'CONTACTING MULTIVERSE…' : mode === 'signin' ? 'ENTER THE MULTIVERSE' : 'FORGE ACCOUNT'}
          </button>

          <div className="text-center text-[10px] font-bold text-[#2C3E50] mt-1">
            New accounts start with 750 gold, 50 gems and the Blue Coral starter collection.
          </div>
        </form>

        <div className="text-center mt-4">
          <button onClick={() => setGuest(true)}
            className="btn-pop px-6 py-2 bg-[#2C3E50] text-[#F7F7F7] heading-font text-xs ink-border-sm shadow-hard-black-xs">
            PLAY AS GUEST (NO SAVING)
          </button>
        </div>
      </div>
    </div>
  );
}
