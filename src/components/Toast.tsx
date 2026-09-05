import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export interface ToastItem {
  id: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(({ type = 'info', title, message, duration = 3200 }: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[250] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const icon =
              toast.type === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : toast.type === 'error' ? (
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              ) : toast.type === 'warning' ? (
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              );

            const borderClass =
              toast.type === 'success'
                ? 'border-emerald-200/80 bg-white'
                : toast.type === 'error'
                ? 'border-rose-200/80 bg-white'
                : toast.type === 'warning'
                ? 'border-amber-200/80 bg-white'
                : 'border-stone-200 bg-white';

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg ${borderClass}`}
              >
                {icon}
                <div className="flex-1 min-w-0 pr-1">
                  <h4 className="text-xs font-bold text-stone-900 leading-tight">{toast.title}</h4>
                  {toast.message && (
                    <p className="text-[11px] text-stone-600 font-medium mt-0.5 leading-snug">{toast.message}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="text-stone-400 hover:text-stone-700 p-0.5 rounded transition"
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
