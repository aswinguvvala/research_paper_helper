import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as Theme) || 'system';
    }
    return 'system';
  });

  const applyTheme = (newTheme: Theme) => {
    const root = window.document.documentElement;
    
    if (newTheme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', systemPrefersDark);
    } else {
      root.classList.toggle('dark', newTheme === 'dark');
    }
  };

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const themes: { value: Theme; icon: React.ComponentType<any>; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  const currentThemeIndex = themes.findIndex(t => t.value === theme);
  const nextTheme = themes[(currentThemeIndex + 1) % themes.length];

  const handleToggle = () => {
    setTheme(nextTheme.value);
  };

  const CurrentIcon = themes.find(t => t.value === theme)?.icon || Sun;

  return (
    <button
      onClick={handleToggle}
      className="relative p-2 rounded-lg bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      title={`Current theme: ${theme}. Click to switch to ${nextTheme.label.toLowerCase()}`}
      aria-label="Toggle theme"
    >
      <CurrentIcon className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
    </button>
  );
};

export default ThemeToggle;