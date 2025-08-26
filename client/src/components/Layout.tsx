import React from 'react';
import { Outlet } from 'react-router-dom';
import { Microscope } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white/80 dark:bg-secondary-900/80 backdrop-blur-sm border-b border-secondary-200/50 dark:border-secondary-700/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and title */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Microscope className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-secondary-900 dark:text-white">
                  PaperScope
                </h1>
              </div>
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;