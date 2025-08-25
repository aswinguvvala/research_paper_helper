// import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { motion } from 'framer-motion';

// Import components (will be created next)
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import DocumentViewerPage from '@/pages/DocumentViewerPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ToastContainer';

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <motion.div 
          className="min-h-screen bg-secondary-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="/document/:documentId" element={<DocumentViewerPage />} />
              
              {/* Catch all route */}
              <Route path="*" element={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-secondary-900 mb-4">
                      404 - Page Not Found
                    </h1>
                    <p className="text-secondary-600 mb-6">
                      The page you're looking for doesn't exist.
                    </p>
                    <a 
                      href="/" 
                      className="btn btn-primary"
                    >
                      Go Home
                    </a>
                  </div>
                </div>
              } />
            </Route>
          </Routes>
        </motion.div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;