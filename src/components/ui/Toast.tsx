import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, X, Info, AlertTriangle } from 'lucide-react';
import { useToastStore } from '@/stores/useToastStore';
import type { ToastType } from '@/types';

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <X size={18} />,
  info: <Info size={18} />,
  warning: <AlertTriangle size={18} />,
};

const colorMap: Record<ToastType, string> = {
  success: 'var(--color-success)',
  error: 'var(--color-danger)',
  info: 'var(--color-primary)',
  warning: 'var(--color-warning)',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-center gap-3 min-w-[280px] max-w-sm px-4 py-3"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span style={{ color: colorMap[toast.type], flexShrink: 0 }}>
              {iconMap[toast.type]}
            </span>
            <p
              className="flex-1 text-sm"
              style={{ color: 'var(--color-text)' }}
            >
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-colors"
              style={{
                color: 'var(--color-text-tertiary)',
                background: 'transparent',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-muted)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
