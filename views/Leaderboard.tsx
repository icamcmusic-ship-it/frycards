
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { LeaderboardEntry } from '../types';
import { Crown, Layers, Zap, Package, User } from 'lucide-react';
import { Link } from 'react-router-dom';

const Leaderboard: React.FC = () => {
  const [type, setType] = useState<'collection' | 'level' | 'packs_opened'>('collection');
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState<Record<string, LeaderboardEntry[]>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (cache[type]) {
      setData(cache[type]);
      return;
    }

    let ignore = false;
    setLoading(true);
    supabase.rpc('get_leaderboard', { p_type: type, p_limit: 50 }).then(({ data, error }) => {
      if (ignore) return;
      if (!error && data) {
        if (mountedRef.current) {
          setData(data);
          setCache(prev => ({ ...prev, [type]: data }));
        }
      } else {
        console.error(error);
      }
      if (mountedRef.current) setLoading(false);
    });
    return () => { ignore = true; };
  }, [type, cache]);

  const getIcon = () => {
    switch(type) {
      case 'collection': return <Layers className="text-indigo-400" size={18} />;
      case 'level': return <Zap className="text-yellow-400" size={18} />;
      case 'packs_opened': return <Package className="text-orange-400" size={18} />;
    }
  };

  const getLabel = () => {
    switch(type) {
      case 'collection': return 'Completion';
      case 'level': return 'Experience';
      case 'packs_opened': return 'Total Opened';
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-heading font-black mb-3">GLOBAL <span className="text-indigo-500">RANKINGS</span></h1>
        <p className="text-slate-400 font-medium">Top operatives in the FryCards ecosystem.</p>
      </div>

      <div className="flex justify-center gap-2 md:gap-4 mb-10 bg-slate-900/50 p-2 rounded-2xl border border-slate-800 inline-flex w-full md:w-auto">
        {[
          { id: 'collection', label: 'Collectors', icon: Layers },
          { id: 'level', label: 'Levels', icon: Zap },
          { id: 'packs_opened', label: 'Packs', icon: Package }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setType(tab.id as any)}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all text-sm uppercase tracking-wide ${
                type === tab.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                  : 'text-slate-500 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="glass rounded-[2rem] overflow-hidden border border-slate-700/50 shadow-2xl">
        {loading ? (
             <div className="p-12 text-center text-slate-500">
               <div className="flex justify-center mb-4">
                 <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
               </div>
               LOADING DATA STREAM...
             </div>
        ) : data.length === 0 ? (
           <div className="p-12 text-center text-slate-500">No data found for this category.</div>
        ) : (
          <div className="w-full">
            {/* Desktop Header */}
            <div className="hidden md:grid grid-cols-12 bg-slate-900/80 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-widest font-bold px-6 py-4">
                <div className="col-span-2 text-center">Rank</div>
                <div className="col-span-7">Operative</div>
                <div className="col-span-3 text-right flex items-center justify-end gap-2">{getIcon()} {getLabel()}</div>
            </div>

            {/* List */}
            <div>
              {data.map((entry) => (
                <div key={entry.rank} className="border-b border-slate-700/30 hover:bg-white/5 transition-colors group p-4 md:px-6 md:py-4 flex flex-col md:grid md:grid-cols-12 items-center gap-4">
                  {/* Rank */}
                  <div className="flex md:block items-center justify-center w-full md:w-auto md:col-span-2 text-center">
                    {entry.rank === 1 ? <div className="inline-block p-2 bg-yellow-400/10 rounded-full border border-yellow-400/20"><Crown className="text-yellow-400 drop-shadow-md" size={24} /></div> : 
                     entry.rank === 2 ? <span className="text-slate-300 font-black text-2xl md:text-lg">#2</span> :
                     entry.rank === 3 ? <span className="text-amber-700 font-black text-2xl md:text-lg">#3</span> :
                     <span className="text-slate-600 font-mono font-bold text-xl md:text-base">#{entry.rank}</span>}
                  </div>

                  {/* Operative */}
                  <div className="col-span-7 font-bold text-white text-lg w-full text-center md:text-left">
                    <Link to={`/profile/${entry.user_id}`} className="flex items-center justify-center md:justify-start gap-3 hover:text-indigo-400 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 overflow-hidden flex-shrink-0">
                         {entry.avatar_url ? <img src={entry.avatar_url} className="w-full h-full object-cover" alt="" /> : <User size={16} className="m-auto text-slate-500 mt-2"/>}
                      </div>
                      {entry.username}
                      {entry.rank <= 3 && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
                    </Link>
                  </div>

                  {/* Score */}
                  <div className="col-span-3 w-full text-center md:text-right font-mono font-bold text-lg text-indigo-300 bg-slate-900/40 md:bg-transparent rounded-xl py-2 md:py-0">
                    {type === 'collection' && (
                      <div className="flex flex-col items-center md:items-end">
                        <span>{entry.completion_percentage}%</span>
                        <span className="text-xs text-slate-600 font-normal">{entry.unique_cards} Cards</span>
                      </div>
                    )}
                    {type === 'level' && (
                      <div className="flex flex-col items-center md:items-end">
                        <span>Lvl {entry.level || 0}</span>
                        <span className="text-xs text-slate-600 font-normal">{entry.xp?.toLocaleString()} XP</span>
                      </div>
                    )}
                    {type === 'packs_opened' && (
                      <span className="text-orange-400">{entry.packs_opened?.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
