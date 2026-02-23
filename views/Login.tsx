
import React from 'react';
import { useGame } from '../context/GameContext';
import { Layers, Zap } from 'lucide-react';

const Login: React.FC = () => {
  const { loading, signInWithDiscord } = useGame();

  const handleLogin = () => {
    signInWithDiscord();
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950">
      {/* Cinematic Background */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1635805737707-575885ab0820?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-slate-950"></div>
      
      {/* Animated Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 blur-[120px] rounded-full animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="glass p-12 rounded-[2.5rem] border-slate-700/30 flex flex-col items-center shadow-2xl">
          
          <div className="mb-10 relative">
            <div className="bg-gradient-to-br from-indigo-600 to-cyan-500 p-6 rounded-3xl shadow-2xl shadow-indigo-500/40 transform rotate-12 group hover:rotate-0 transition-transform duration-500">
              <Layers size={52} className="text-white" />
            </div>
            <div className="absolute -top-4 -right-4 bg-yellow-500 p-2 rounded-xl shadow-lg border-2 border-slate-900 animate-bounce">
              <Zap size={20} className="text-slate-900" />
            </div>
          </div>
          
          <h1 className="text-5xl font-heading font-black text-white text-center mb-3 tracking-tighter leading-none">
            FRY<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">CARDS</span>
          </h1>
          
          <p className="text-slate-400 text-center mb-12 font-medium leading-relaxed max-w-xs">
            Collect cards, build decks, and battle other players online.
          </p>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="group relative w-full py-5 overflow-hidden rounded-2xl bg-[#5865F2] hover:bg-[#4752C4] shadow-[0_15px_30px_rgba(88,101,242,0.3)] transition-all duration-300 active:scale-[0.98]"
          >
            <div className="relative flex items-center justify-center gap-4">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 26.153 26.153 0 0 0-3.356 6.857 26.162 26.162 0 0 0-3.352-6.857.072.072 0 0 0-.08-.037 19.736 19.736 0 0 0-4.889 1.515.068.068 0 0 0-.032.027C.533 9.046-.319 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.118.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.157 2.419 0 1.334-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.157 2.419 0 1.334-.946 2.42-2.157 2.42z"/>
              </svg>
              <span className="font-heading font-black text-white text-xl tracking-tight">
                {loading ? 'Logging in...' : 'Login with Discord'}
              </span>
            </div>
          </button>
          
          <div className="mt-12 pt-8 border-t border-slate-800/50 w-full flex justify-between items-center text-[10px] text-slate-500 font-mono tracking-widest uppercase font-bold">
             <span className="flex items-center gap-2">
               <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
               V1.2.0
             </span>
             <span className="text-slate-600">FryCards TCG</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
