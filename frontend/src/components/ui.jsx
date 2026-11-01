import { createContext, useCallback, useContext, useState } from 'react';

export function DifficultyBadge({ level }) {
  const map = {
    Easy: 'text-primary bg-primary/10 border-primary/30',
    Medium: 'text-warning bg-warning/10 border-warning/30',
    Hard: 'text-error bg-error/10 border-error/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${map[level] || map.Easy}`}>
      {level}
    </span>
  );
}

export function VerdictBadge({ verdict, size = 'md' }) {
  const map = {
    Accepted: 'text-primary bg-primary/10 border-primary/30',
    'Wrong Answer': 'text-error bg-error/10 border-error/30',
    'Runtime Error': 'text-error bg-error/10 border-error/30',
    'Compilation Error': 'text-error bg-error/10 border-error/30',
    'Time Limit Exceeded': 'text-warning bg-warning/10 border-warning/30',
    'Memory Limit Exceeded': 'text-warning bg-warning/10 border-warning/30',
    Pending: 'text-secondary bg-secondary/10 border-secondary/30',
    Executed: 'text-secondary bg-secondary/10 border-secondary/30',
  };
  const sizeCls = size === 'lg' ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full font-medium border ${sizeCls} ${map[verdict] || map.Pending}`}>
      {verdict}
    </span>
  );
}

export function StatusPill({ status }) {
  const map = {
    Solved: 'text-primary bg-primary/10 border border-primary/20',
    Attempted: 'text-warning bg-warning/10 border border-warning/20',
    Todo: 'text-text-secondary bg-black/5 dark:bg-white/5 border border-border',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || map.Todo}`}>{status}</span>;
}

export function Avatar({ name, color = '#465fff', size = 36, src }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white shrink-0 shadow-theme-xs"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`bg-card border border-border rounded-2xl shadow-theme-sm transition-colors ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Button({ variant = 'primary', className = '', children, ...rest }) {
  const variants = {
    primary: 'bg-primary text-white hover:bg-brand-600 shadow-theme-xs active:scale-[0.98]',
    secondary: 'bg-secondary text-white hover:brightness-110 active:scale-[0.98]',
    ghost: 'bg-transparent text-text border border-border hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98]',
    danger: 'bg-error/10 text-error border border-error/30 hover:bg-error/20 active:scale-[0.98]',
    subtle: 'bg-black/5 dark:bg-white/5 text-text hover:bg-black/10 dark:hover:bg-white/10 active:scale-[0.98]',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ className = '', ...rest }) {
  return (
    <input
      className={`w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text placeholder:text-text-secondary focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-theme-xs ${className}`}
      {...rest}
    />
  );
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select
      className={`bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-theme-xs ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

// A small centered confirm modal for destructive actions (delete, etc).
// Deliberately generic — pass a title/message and an onConfirm handler.
export function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Delete', danger = true, onConfirm, onCancel, loading = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-up" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-theme-xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-semibold text-base text-text">{title}</h3>
          {message && <p className="text-text-secondary text-sm mt-1.5">{message}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading} className="!px-4 !py-2 text-xs">Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading} className="!px-4 !py-2 text-xs">
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Toast system ---
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed top-16 right-4 sm:top-auto sm:bottom-5 sm:right-5 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-fade-up px-4 py-3 rounded-xl border text-sm shadow-lg glass min-w-[220px] max-w-sm ${
              t.type === 'success'
                ? 'border-primary/40 text-primary'
                : t.type === 'error'
                ? 'border-error/40 text-error'
                : 'border-border text-text'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function EmptyState({ title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-border mb-4 flex items-center justify-center text-text-secondary text-2xl">
        ◌
      </div>
      <p className="text-text font-semibold mb-1">{title}</p>
      {subtitle && <p className="text-text-secondary text-sm max-w-sm mb-4">{subtitle}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/5 rounded-xl ${className}`} />;
}
