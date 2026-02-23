
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../context/GameContext';

interface ToastProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            layout
            className="pointer-events-auto min-w-[300px] max-w-sm"
          >
            <div className={`
              relative overflow-hidden rounded-xl p-4 shadow-2xl border backdrop-blur-xl
              ${toast.type === 'success' ? 'bg-slate-900/90 border-green-500/50 text-green-100' : ''}
              ${toast.type === 'error' ? 'bg-slate-900/90 border-red-500/50 text-red-100' : ''}
              ${toast.type === 'info' ? 'bg-slate-900/90 border-indigo-500/50 text-indigo-100' : ''}
            `}>
              {/* Glow Effect */}
              <div className={`absolute top-0 left-0 w-1 h-full 
                ${toast.type === 'success' ? 'bg-green-500' : ''}
                ${toast.type === 'error' ? 'bg-red-500' : ''}
                ${toast.type === 'info' ? 'bg-indigo-500' : ''}
              `}></div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {toast.type === 'success' && <CheckCircle size={18} className="text-green-400" />}
                  {toast.type === 'error' && <AlertCircle size={18} className="text-red-400" />}
                  {toast.type === 'info' && <Info size={18} className="text-indigo-400" />}
                </div>
                
                <div className="flex-1">
                  <h4 className="font-bold text-sm uppercase tracking-wide mb-0.5">
                    {toast.type === 'success' ? 'System Success' : toast.type === 'error' ? 'System Error' : 'Notification'}
                  </h4>
                  <p className="text-sm font-medium opacity-90 leading-tight">{toast.message}</p>
                </div>

                <button 
                  onClick={() => removeToast(toast.id)}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default Toast;
