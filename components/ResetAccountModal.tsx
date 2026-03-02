import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, RotateCcw, ShieldAlert } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useGame } from '../context/GameContext';

interface ResetAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CONFIRM_PHRASE = 'RESET';

const WIPE_LIST = [
  'All cards and card collection',
  'Gold, gems, XP & level progress',
  'Decks, battle history & season pass',
  'Friends, trades & marketplace listings',
  'Cosmetics, daily missions & quests',
];

const ResetAccountModal: React.FC<ResetAccountModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useGame();
  const [step, setStep] = useState<'warn' | 'confirm' | 'resetting'>('warn');
  const [inputValue, setInputValue] = useState('');

  const isConfirmed = inputValue.trim().toUpperCase() === CONFIRM_PHRASE;

  const handleClose = () => {
    if (step === 'resetting') return; // block close while in progress
    setStep('warn');
    setInputValue('');
    onClose();
  };

  const handleReset = async () => {
    if (!isConfirmed || step === 'resetting') return;
    setStep('resetting');
    try {
      const { data, error } = await supabase.rpc('reset_account');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Reset failed');

      showToast('Account reset! Signing you out…', 'success');

      // Short delay so the toast is visible, then sign out
      setTimeout(async () => {
        await supabase.auth.signOut();
      }, 1500);
    } catch (err: any) {
      showToast(err.message || 'Reset failed — please try again', 'error');
      setStep('confirm');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 24 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="bg-slate-900 border border-red-900/60 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-red-950/40 relative"
          >
            {/* Close button */}
            {step !== 'resetting' && (
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            )}

            {/* ── STEP 1: Warning ─────────────────────────── */}
            {step === 'warn' && (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/40">
                    <ShieldAlert size={22} className="text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-heading font-black text-white tracking-wider">RESTART ACCOUNT</h2>
                    <p className="text-xs text-red-400 font-mono">This cannot be undone</p>
                  </div>
                </div>

                <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                  Restarting wipes <span className="text-white font-bold">all progress</span> and resets your
                  account to starter values (5,000 gold · 100 gems). Your username is kept.
                </p>

                <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 mb-6">
                  <p className="text-[11px] font-black text-red-400 uppercase tracking-widest mb-2">What gets deleted</p>
                  <ul className="space-y-1">
                    {WIPE_LIST.map(item => (
                      <li key={item} className="text-xs text-slate-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-700 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setStep('confirm')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-black bg-red-900/60 hover:bg-red-800 text-red-200 transition-all border border-red-700/50"
                  >
                    I understand, continue
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 2: Type to confirm ──────────────────── */}
            {step === 'confirm' && (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/40">
                    <AlertTriangle size={22} className="text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-heading font-black text-white tracking-wider">FINAL CONFIRMATION</h2>
                    <p className="text-xs text-red-400 font-mono">Point of no return</p>
                  </div>
                </div>

                <p className="text-sm text-slate-400 mb-5 leading-relaxed">
                  Type <span className="text-white font-black font-mono bg-slate-800 px-1.5 py-0.5 rounded">{CONFIRM_PHRASE}</span> below to permanently reset your account.
                </p>

                <input
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder={`Type ${CONFIRM_PHRASE} here`}
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white font-mono text-sm mb-5 outline-none focus:border-red-600 transition-colors placeholder:text-slate-600"
                />

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep('warn'); setInputValue(''); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={!isConfirmed}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all ${
                      isConfirmed
                        ? 'bg-red-700 hover:bg-red-600 text-white shadow-lg shadow-red-950/40 active:scale-95'
                        : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    <RotateCcw size={14} />
                    Reset Everything
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 3: In progress ──────────────────────── */}
            {step === 'resetting' && (
              <div className="text-center py-6">
                <div className="w-12 h-12 border-4 border-red-800/40 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white font-heading font-black text-lg tracking-wider">RESETTING…</p>
                <p className="text-slate-500 text-xs font-mono mt-1">Wiping all data and signing you out</p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ResetAccountModal;
