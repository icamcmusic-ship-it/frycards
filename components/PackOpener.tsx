import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PackResult, Card } from '../types';
import CardDisplay from '../components/CardDisplay';
import { X, Sparkles, Zap, ArrowRight, Loader2 } from 'lucide-react';
import Confetti from 'react-confetti';
import { SOUNDS, CARD_BACK_IMAGE } from '../constants';
import { useGame } from '../context/GameContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useImageLoadStatus } from '../context/PreloaderContext';

interface PackOpenerProps {
  packResult: PackResult | null;
  onClose: () => void;
  packImage: string;
}

const RARITY_WEIGHTS: Record<string, number> = {
  'Common': 1,
  'Uncommon': 2,
  'Rare': 3,
  'Super-Rare': 4,
  'Mythic': 5,
  'Divine': 6
};

const PackOpener: React.FC<PackOpenerProps> = ({ packResult, onClose, packImage }) => {
  const { dashboard } = useGame();
  const [stage, setStage] = useState<'shaking' | 'opening' | 'stack' | 'summary'>('shaking');
  
  // Track which card in the stack we are currently viewing
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sortedCards, setSortedCards] = useState<Card[]>([]);

  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Use the user's equipped card back, or fallback to default
  const cardBackUrl = dashboard?.profile?.card_back_url || CARD_BACK_IMAGE;

  // Extract URLs for preloading
  const imageUrls = useMemo(() => sortedCards.map(c => c.image_url).filter(Boolean), [sortedCards]);
  const { loaded: imagesReady } = useImageLoadStatus(imageUrls);

  // Audio Instances
  const sfx = useMemo(() => {
    const createAudio = (src: string): HTMLAudioElement | null => (src && src.length > 0 ? new Audio(src) : null);
    return {
      shake: createAudio(SOUNDS.PACK_SHAKE),
      open: createAudio(SOUNDS.PACK_OPEN),
      revealCommon: createAudio(SOUNDS.REVEAL_COMMON),
      revealRare: createAudio(SOUNDS.REVEAL_RARE),
      revealLegendary: createAudio(SOUNDS.REVEAL_LEGENDARY),
      success: createAudio(SOUNDS.SUCCESS)
    };
  }, []);

  // Sort Cards on Mount
  useEffect(() => {
    if (packResult) {
      // Sort cards: Lowest rarity first, highest rarity last
      const sorted = [...packResult.cards].sort((a, b) => {
        const weightA = RARITY_WEIGHTS[a.rarity] || 0;
        const weightB = RARITY_WEIGHTS[b.rarity] || 0;
        return weightA - weightB;
      });
      setSortedCards(sorted);
    }
  }, [packResult]);

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      Object.values(sfx).forEach((audio) => {
        if (audio) {
          const a = audio as HTMLAudioElement;
          a.pause();
          a.src = "";
        }
      });
    };
  }, [sfx]);

  const triggerHaptic = (pattern: number | number[]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  // Sequence Controller
  useEffect(() => {
    if (!packResult) return;

    // Start with shaking
    setStage('shaking');
    
    if (sfx.shake) {
      sfx.shake.volume = 0.5;
      sfx.shake.play().catch(() => {});
    }
    triggerHaptic([50, 50, 50, 50]);

    const t1 = setTimeout(() => {
      setStage('opening');
      if (sfx.open) {
        sfx.open.volume = 0.6;
        sfx.open.play().catch(() => {});
      }
      triggerHaptic(200);
    }, 1200);

    return () => clearTimeout(t1);
  }, [packResult, sfx]);

  // Transition to Stack only when images are ready
  useEffect(() => {
    if (stage === 'opening' && imagesReady) {
      const t2 = setTimeout(() => {
        setStage('stack');
        setCurrentIndex(0);
        setIsFlipped(false); // Reset flip state for first card
      }, 800); // Slight delay to show the "Success" state briefly
      return () => clearTimeout(t2);
    }
  }, [stage, imagesReady]);

  const handleStackClick = () => {
    // If not yet flipped, flip it
    if (!isFlipped) {
        setIsFlipped(true);
        const card = sortedCards[currentIndex];
        
        // Sound & Haptic based on rarity
        if (['Mythic', 'Divine'].includes(card.rarity)) {
           sfx.revealLegendary?.play().catch(() => {});
           triggerHaptic([100, 50, 100]);
        } else if (['Rare', 'Super-Rare'].includes(card.rarity)) {
           sfx.revealRare?.play().catch(() => {});
           triggerHaptic(50);
        } else {
           sfx.revealCommon?.play().catch(() => {});
           triggerHaptic(20);
        }

    } else {
        // Already flipped, move to next card
        if (currentIndex < sortedCards.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setIsFlipped(false);
        } else {
            // End of stack
            setStage('summary');
            sfx.success?.play().catch(() => {});
        }
    }
  };

  if (!packResult) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl overflow-y-auto">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black opacity-80 pointer-events-none"></div>
      
      {stage === 'summary' && <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={300} colors={['#8b5cf6', '#ec4899', '#06b6d4', '#facc15']} />}

      <button onClick={onClose} className="absolute top-8 right-8 p-3 text-slate-500 hover:text-white bg-slate-900/80 rounded-full z-50 border border-slate-700 hover:bg-slate-800 transition-colors">
        <X size={24} />
      </button>

      {/* STAGE: SHAKING / OPENING ANIMATION */}
      {(stage === 'shaking' || stage === 'opening') && (
        <div className="text-center relative z-10 flex flex-col items-center">
          <div className={`relative transition-all duration-500 ${stage === 'shaking' ? 'animate-pack-shake' : 'scale-[2] opacity-0 blur-xl'}`}>
            <img src={packImage} className="w-72 h-auto drop-shadow-[0_0_50px_rgba(79,70,229,0.5)]" alt="Pack" />
          </div>
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="mt-12 flex flex-col items-center gap-2"
          >
             {stage === 'opening' && !imagesReady ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="animate-spin text-indigo-400" size={32} />
                  <p className="font-mono text-xs text-indigo-300 tracking-widest animate-pulse">DOWNLOADING ASSETS...</p>
                </div>
             ) : (
                <>
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <p className="font-heading text-xl font-bold tracking-[0.4em] text-indigo-400">
                    {stage === 'shaking' ? 'Opening...' : 'Success!'}
                  </p>
                </>
             )}
          </motion.div>
        </div>
      )}

      {/* STAGE: STACK REVEAL */}
      {stage === 'stack' && (
         <div className="flex flex-col items-center justify-center h-full w-full relative z-20 cursor-pointer" onClick={handleStackClick}>
            <div className="relative w-[300px] h-[400px] md:w-[360px] md:h-[480px]">
                {/* Background Cards (Visual Stack Effect) */}
                {sortedCards.slice(currentIndex + 1).map((_, i) => (
                    <div 
                        key={i} 
                        className="absolute inset-0 bg-slate-800 rounded-xl border border-slate-700 shadow-xl"
                        style={{ 
                            transform: `translate(${i * 2}px, ${i * -2}px) rotate(${i % 2 === 0 ? 1 : -1}deg)`,
                            zIndex: sortedCards.length - i - currentIndex - 1
                        }}
                    >
                         <img src={cardBackUrl} className="w-full h-full object-cover rounded-xl opacity-50" />
                    </div>
                )).slice(0, 3)} {/* Only show a few cards behind to represent the stack */}

                {/* Current Active Card */}
                <motion.div
                    key={currentIndex}
                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="absolute inset-0 z-50"
                >
                    <CardDisplay 
                        card={sortedCards[currentIndex]} 
                        isFlipped={isFlipped}
                        backImage={cardBackUrl}
                        size="xl" // Large size for the main reveal
                        viewMode="3d" // Enable 3D tilt
                    />
                </motion.div>

                 {/* Tap hint */}
                 <div className="absolute -bottom-24 left-0 right-0 text-center pointer-events-none">
                     <p className="text-slate-400 font-mono text-xs uppercase tracking-widest animate-pulse">
                         {isFlipped ? (currentIndex < sortedCards.length - 1 ? "Tap for next card" : "Tap to finish") : "Tap to reveal"}
                     </p>
                     <p className="text-slate-600 text-[10px] mt-1">{currentIndex + 1} / {sortedCards.length}</p>
                 </div>
            </div>
         </div>
      )}

      {/* STAGE: SUMMARY GRID */}
      {stage === 'summary' && (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 relative z-10 overflow-y-auto">
          <div className="text-center mb-8 shrink-0">
             <h2 className="text-3xl font-heading font-black text-white mb-2">PACK SUMMARY</h2>
             <div className="flex justify-center gap-4">
                 {packResult.new_card_count > 0 && <span className="text-cyan-400 font-bold text-sm bg-cyan-900/30 px-3 py-1 rounded-full border border-cyan-500/30">{packResult.new_card_count} NEW</span>}
                 <span className="text-yellow-400 font-bold text-sm bg-yellow-900/30 px-3 py-1 rounded-full border border-yellow-500/30">+{packResult.xp_gained} XP</span>
             </div>
          </div>

          <motion.div 
             className="flex flex-wrap justify-center items-center gap-6 max-w-[1400px] pb-24"
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
          >
            {sortedCards.map((card, index) => (
              <motion.div 
                key={index} 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="relative group"
              >
                <CardDisplay 
                  card={card} 
                  isFlipped={true} 
                  backImage={cardBackUrl}
                  size="md"
                />
                {card.is_new && (
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-cyan-500 text-black text-[10px] font-black px-2 py-0.5 rounded shadow-lg border border-white">
                    NEW
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>

          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="fixed bottom-8 bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 flex gap-4"
          >
            <button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-heading font-black tracking-widest shadow-xl transition-transform hover:scale-105">
              COLLECT ALL
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default PackOpener;
