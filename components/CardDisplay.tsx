
import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../types';
import { Star, Flame, Droplets, Dna, Cpu, Ghost, Moon, Sun, Hexagon, ImageOff, Zap } from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from 'framer-motion';

interface CardDisplayProps {
  card: Card;
  isFlipped?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showQuantity?: boolean;
  showFoilEffect?: boolean;
  backImage?: string;
  viewMode?: 'normal' | '3d';
}

const RARITY_STYLES: Record<string, { color: string, glow: string, border: string, bg: string }> = {
  'Common': { color: 'text-slate-300', border: 'border-slate-500', glow: 'group-hover:shadow-[0_0_15px_rgba(148,163,184,0.3)]', bg: 'bg-slate-900' },
  'Uncommon': { color: 'text-emerald-400', border: 'border-emerald-500', glow: 'group-hover:shadow-[0_0_15px_rgba(52,211,153,0.4)]', bg: 'bg-emerald-950' },
  'Rare': { color: 'text-blue-400', border: 'border-blue-500', glow: 'group-hover:shadow-[0_0_20px_rgba(96,165,250,0.5)]', bg: 'bg-blue-950' },
  'Super-Rare': { color: 'text-purple-400', border: 'border-purple-500', glow: 'group-hover:shadow-[0_0_25px_rgba(232,121,249,0.6)]', bg: 'bg-purple-950' },
  'Mythic': { color: 'text-yellow-400', border: 'border-yellow-500', glow: 'group-hover:shadow-[0_0_30px_rgba(250,204,21,0.7)]', bg: 'bg-yellow-950' },
  'Divine': { color: 'text-red-500', border: 'border-red-600', glow: 'group-hover:shadow-[0_0_40px_rgba(244,63,94,0.8)]', bg: 'bg-red-950' }
};

const CardDisplay: React.FC<CardDisplayProps> = ({ 
  card, 
  isFlipped = true, 
  onClick, 
  size = 'md',
  showQuantity = false,
  showFoilEffect = true,
  backImage,
  viewMode = 'normal'
}) => {
  const isFoil = card.is_foil || (card.foil_quantity || 0) > 0;
  const isLeader = card.card_type === 'Leader';
  
  const cardRef = useRef<HTMLDivElement>(null);

  // Motion values for tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 400, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 400, damping: 30 });

  const rotateRange = viewMode === '3d' ? 45 : 20;
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [rotateRange, -rotateRange]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-rotateRange, rotateRange]);

  const glareOpacity = useTransform(mouseYSpring, [-0.5, 0.5], [0.4, 0]);
  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], [0, 100]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.4) 0%, transparent 60%)`;

  useEffect(() => {
    if (viewMode !== '3d') return;
    const handleWindowMouseMove = (e: MouseEvent) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      const xPct = (mouseX / width) - 0.5;
      const yPct = (mouseY / height) - 0.5;
      x.set(xPct);
      y.set(yPct);
    };
    window.addEventListener('mousemove', handleWindowMouseMove);
    return () => window.removeEventListener('mousemove', handleWindowMouseMove);
  }, [viewMode, isFlipped, x, y]);

  // Accelerometer Handler
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        const xVal = Math.min(Math.max(e.gamma, -45), 45) / 90; 
        const yVal = Math.min(Math.max(e.beta - 45, -45), 45) / 90;
        x.set(xVal);
        y.set(yVal);
      }
    };

    if (window.DeviceOrientationEvent && typeof (window.DeviceOrientationEvent as any).requestPermission !== 'function') {
         window.addEventListener('deviceorientation', handleOrientation);
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [x, y]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode === '3d') return;
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = (mouseX / width) - 0.5;
    const yPct = (mouseY / height) - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    if (viewMode === '3d') return;
    x.set(0);
    y.set(0);
  };

  const style = RARITY_STYLES[card.rarity] || RARITY_STYLES['Common'];
  
  const sizeClasses = {
    sm: 'w-[135px] h-[190px]', 
    md: 'w-[240px] h-[340px]', 
    lg: 'w-[300px] h-[420px]',
    xl: 'w-[360px] h-[500px]',
  };

  const getElementIcon = () => {
    switch(card.element) {
        case 'fire': return <Flame size={16} className="text-orange-500 fill-orange-500/20" />;
        case 'ice': return <Droplets size={16} className="text-cyan-400 fill-cyan-400/20" />;
        case 'nature': return <Dna size={16} className="text-green-500" />;
        case 'tech': return <Cpu size={16} className="text-blue-500" />;
        case 'void': return <Ghost size={16} className="text-purple-500" />;
        case 'shadow': return <Moon size={16} className="text-slate-400" />;
        case 'holy': return <Sun size={16} className="text-yellow-200" />;
        default: return <Hexagon size={16} className="text-slate-400" />;
    }
  };

  const cost = card.dice_cost || 0;

  return (
    <motion.div 
      ref={cardRef}
      className={`relative ${sizeClasses[size]} cursor-pointer group select-none transition-all duration-300 ${style.glow}`}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ 
        perspective: '1500px', 
        transformStyle: 'preserve-3d',
      }}
    >
      <motion.div 
        className="w-full h-full relative"
        initial={false}
        animate={{ rotateY: isFlipped ? 0 : 180 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        style={{ 
          transformStyle: 'preserve-3d',
          rotateX: isFlipped ? rotateX : 0,
          rotateY: isFlipped ? rotateY : 0,
        }}
      >
        {/* Front of Card (Face Up) */}
        <div 
          className={`absolute inset-0 rounded-2xl overflow-hidden bg-slate-900 flex flex-col shadow-2xl ${style.color}`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(0deg)' }}
        >
          {/* Dynamic Glare Overlay */}
          <motion.div 
            className="absolute inset-0 z-50 pointer-events-none mix-blend-overlay"
            style={{ background: glareBackground, opacity: glareOpacity }}
          />

          {/* Border / Frame */}
          <div className={`absolute inset-0 border-[3px] rounded-2xl z-20 pointer-events-none opacity-100 transition-colors duration-300 ${style.border} ${isLeader ? 'border-yellow-400 shadow-[inset_0_0_20px_rgba(250,204,21,0.5)]' : ''} ${isFoil ? 'border-opacity-50' : ''}`}></div>
          
          {/* Foil Rainbow Overlay */}
          {showFoilEffect && isFoil && (
            <div className="absolute inset-0 z-30 pointer-events-none opacity-40 mix-blend-overlay bg-[linear-gradient(115deg,transparent,rgba(255,0,0,0.3),rgba(255,255,0,0.3),rgba(0,255,0,0.3),rgba(0,255,255,0.3),rgba(0,0,255,0.3),rgba(255,0,255,0.3),transparent)] bg-[length:300%_300%] animate-hologram"></div>
          )}

          {/* Leader Indicator */}
          {isLeader && (
            <div className="absolute top-0 inset-x-0 h-1 bg-yellow-400 z-30 shadow-[0_0_10px_rgba(250,204,21,1)]" />
          )}

          {/* Full Art Image Layer */}
          <div className="absolute inset-0 bg-black">
             {card.is_video ? (
                <video src={card.image_url} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-90 glitch-hover" />
             ) : card.image_url ? (
                <img src={card.image_url} alt={card.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
             ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-600">
                    <ImageOff size={32} />
                    <span className="text-[10px] font-mono mt-2">NO DATA</span>
                </div>
             )}
             {/* Gradient Overlay for Text Readability */}
             <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90"></div>
             
             {/* Top Gradient for Icons */}
             <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 to-transparent"></div>
          </div>

          {/* Top Icons Layer */}
          <div className="absolute top-3 left-3 right-3 z-30 flex justify-between items-start">
             {/* Cost Orb */}
             <div className="w-9 h-9 rounded-full bg-slate-950/80 border border-slate-600 backdrop-blur-sm shadow-xl flex items-center justify-center font-heading font-black text-white z-30 relative overflow-hidden group-hover:border-indigo-400 transition-colors">
               <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-transparent opacity-50" />
               <div className="relative z-10 flex gap-0.5">
                   {cost > 3 ? (
                       <span className="text-lg drop-shadow-md">{cost}</span>
                   ) : (
                       Array.from({length: cost}).map((_, i) => (
                           <div key={i} className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_4px_white]" />
                       ))
                   )}
               </div>
             </div>
             
             {/* Element Icon */}
             <div className="w-9 h-9 rounded-full bg-slate-950/80 border border-slate-600 backdrop-blur-sm shadow-xl flex items-center justify-center z-30">
               {getElementIcon()}
             </div>
          </div>

          {/* New Tag */}
          {card.is_new && (
            <span className="absolute top-14 left-2 z-40 bg-cyan-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-sm animate-pulse shadow-lg">
              NEW
            </span>
          )}

          {/* Bottom Info Layer (Minimalist) */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-40 text-center flex flex-col items-center">
            {/* Rarity Border Line */}
            <div className={`w-12 h-0.5 mb-2 rounded-full ${style.bg.replace('bg-', 'bg-')}`}></div>
            
            <h3 className={`font-heading font-black text-white text-base md:text-lg leading-tight uppercase tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]`}>
                {card.name}
            </h3>
            
            <div className="flex items-center gap-2 mt-1 opacity-80">
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{card.card_type}</span>
            </div>
          </div>
        </div>

        {/* Back of Card (Face Down) */}
        <div 
          className="absolute inset-0 rounded-2xl border-[3px] border-slate-700 bg-slate-900 flex items-center justify-center overflow-hidden shadow-2xl"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
           {backImage ? (
             <img src={backImage} alt="Card Back" className="w-full h-full object-cover" />
           ) : (
             <>
               <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black"></div>
               <div className="absolute inset-0 opacity-10" style={{ 
                 backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .3) 25%, rgba(255, 255, 255, .3) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .3) 75%, rgba(255, 255, 255, .3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, .3) 25%, rgba(255, 255, 255, .3) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .3) 75%, rgba(255, 255, 255, .3) 76%, transparent 77%, transparent)',
                 backgroundSize: '30px 30px'
               }}></div>

               <div className="relative z-10 text-center">
                 <div className="w-16 h-16 mx-auto mb-3 border-2 border-indigo-500/30 rounded-full flex items-center justify-center bg-indigo-500/10 backdrop-blur-sm relative">
                    <div className="absolute inset-0 rounded-full border border-t-indigo-400 border-r-transparent border-b-indigo-400 border-l-transparent animate-spin"></div>
                    <Zap size={24} className="text-indigo-400" />
                 </div>
                 <div className="font-heading text-xl font-black text-white tracking-tighter drop-shadow-[2px_2px_0_rgba(236,72,153,1)]">DICE<span className="text-indigo-500">CMD</span></div>
                 <div className="text-[8px] font-mono text-slate-500 tracking-[0.3em] mt-1">GALAXY AT WAR</div>
               </div>
             </>
           )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CardDisplay;
