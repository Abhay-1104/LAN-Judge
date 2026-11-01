import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ className = '' }) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('lj_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('lj_theme', 'light');
    }
  }, [isDark]);

  const toggle = () => {
    setIsDark((prev) => !prev);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label="Toggle theme"
      className={`relative p-2 rounded-xl border border-border bg-surface text-text-secondary hover:text-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors shadow-theme-xs ${className}`}
    >
      {isDark ? (
        <Sun size={18} className="transition-transform hover:rotate-45" />
      ) : (
        <Moon size={18} className="transition-transform hover:-rotate-12" />
      )}
    </button>
  );
}
