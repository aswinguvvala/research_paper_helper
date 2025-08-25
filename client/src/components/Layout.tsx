import React from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Brain, Github, HelpCircle } from 'lucide-react';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-secondary-50">
      {/* Header */}
      <header className="bg-white border-b border-secondary-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and title */}
            <motion.div 
              className="flex items-center space-x-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-secondary-900">
                  Research Assistant
                </h1>
                <p className="text-xs text-secondary-500 -mt-0.5">
                  AI-powered paper analysis
                </p>
              </div>
            </motion.div>

            {/* Navigation */}
            <motion.nav 
              className="hidden md:flex items-center space-x-6"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <a
                href="/"
                className="flex items-center space-x-2 text-secondary-600 hover:text-primary-600 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">Documents</span>
              </a>
              
              <a
                href="https://github.com/your-repo/research-assistant"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-secondary-600 hover:text-primary-600 transition-colors"
              >
                <Github className="w-4 h-4" />
                <span className="text-sm font-medium">GitHub</span>
              </a>
              
              <button className="flex items-center space-x-2 text-secondary-600 hover:text-primary-600 transition-colors">
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Help</span>
              </button>
            </motion.nav>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                type="button"
                className="text-secondary-600 hover:text-primary-600 focus:outline-none"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-secondary-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
            <div className="text-sm text-secondary-500">
              © 2024 Research Paper Assistant. Built with AI and modern web technologies.
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-secondary-500">
              <span>
                Powered by{' '}
                <a 
                  href="https://openai.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  OpenAI
                </a>
                {' '}&{' '}
                <a 
                  href="https://huggingface.co" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  Sentence Transformers
                </a>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;