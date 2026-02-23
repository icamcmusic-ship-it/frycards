import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

interface SoundContextType {
  playSfx: (src: string, volume?: number) => void;
  playMusic: (src: string) => void;
  stopMusic: () => void;
  sfxVolume: number;
  musicVolume: number;
  isMuted: boolean;
  lowPerformanceMode: boolean;
  setSfxVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
  setLowPerformanceMode: (v: boolean) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

const PREF_KEY = 'frycards_sound_prefs';

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxPool = useRef<HTMLAudioElement[]>([]);

  const loadPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
  };

  const saved = loadPrefs();
  const [sfxVolume, setSfxVolumeState] = useState<number>(saved.sfxVolume ?? 0.6);
  const [musicVolume, setMusicVolumeState] = useState<number>(saved.musicVolume ?? 0.3);
  const [isMuted, setMutedState] = useState<boolean>(saved.isMuted ?? false);
  const [lowPerformanceMode, setLowPerfState] = useState<boolean>(saved.lowPerformanceMode ?? false);

  const savePrefs = (patch: object) => {
    const current = loadPrefs();
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...current, ...patch }));
  };

  const setSfxVolume = useCallback((v: number) => { setSfxVolumeState(v); savePrefs({ sfxVolume: v }); }, []);
  const setMusicVolume = useCallback((v: number) => {
    setMusicVolumeState(v);
    savePrefs({ musicVolume: v });
    if (musicRef.current) musicRef.current.volume = v;
  }, []);
  const setMuted = useCallback((v: boolean) => {
    setMutedState(v);
    savePrefs({ isMuted: v });
    if (musicRef.current) musicRef.current.muted = v;
  }, []);
  const setLowPerformanceMode = useCallback((v: boolean) => { setLowPerfState(v); savePrefs({ lowPerformanceMode: v }); }, []);

  const playSfx = useCallback((src: string, volume = 1.0) => {
    if (isMuted) return;
    // Reuse a finished audio element from pool or create new
    let audio = sfxPool.current.find(a => a.paused && a.ended);
    if (!audio) {
      audio = new Audio();
      sfxPool.current.push(audio);
    }
    audio.src = src;
    audio.volume = Math.min(sfxVolume * volume, 1);
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, [isMuted, sfxVolume]);

  const playMusic = useCallback((src: string) => {
    if (!musicRef.current) musicRef.current = new Audio();
    if (musicRef.current.src !== src) {
      musicRef.current.src = src;
      musicRef.current.loop = true;
    }
    musicRef.current.volume = musicVolume;
    musicRef.current.muted = isMuted;
    musicRef.current.play().catch(() => {});
  }, [musicVolume, isMuted]);

  const stopMusic = useCallback(() => {
    if (musicRef.current) { musicRef.current.pause(); musicRef.current.currentTime = 0; }
  }, []);

  // Trim pool size periodically
  useEffect(() => {
    const id = setInterval(() => {
      sfxPool.current = sfxPool.current.filter(a => !a.paused || !a.ended).slice(0, 10);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <SoundContext.Provider value={{
      playSfx, playMusic, stopMusic,
      sfxVolume, musicVolume, isMuted, lowPerformanceMode,
      setSfxVolume, setMusicVolume, setMuted, setLowPerformanceMode
    }}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSound must be used within SoundProvider');
  return ctx;
};