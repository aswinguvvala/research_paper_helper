import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Loader2, AlertCircle } from 'lucide-react';
import TextSelectionPopup, { TextSelectionData } from './TextSelectionPopup';

// Browser detection utility
const getBrowserName = (): string => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'safari';
  if (userAgent.includes('Firefox')) return 'firefox';
  if (userAgent.includes('Chrome')) return 'chrome';
  if (userAgent.includes('Edge')) return 'edge';
  return 'unknown';
};

// Set up PDF.js worker with fallback options
const setupPDFWorker = () => {
  try {
    // Try multiple CDN options for better reliability
    const workerUrls = [
      `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`,
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`,
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
    ];
    
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrls[0];
    
    console.log('PDF.js worker configured:', {
      version: pdfjs.version,
      workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
      browser: getBrowserName()
    });
  } catch (error) {
    console.error('Failed to setup PDF worker:', error);
  }
};

// Initialize worker
setupPDFWorker();

export interface PDFViewerProps {
  documentId: string;
  onTextSelection?: (selectedText: string, pageNumber: number) => void;
  onTextAction?: (action: string, text: string, pageNumber?: number) => void;
  className?: string;
}

interface TextSelection {
  text: string;
  pageNumber: number;
}

const PDFViewer: React.FC<PDFViewerProps> = ({
  documentId,
  onTextSelection,
  onTextAction,
  className = ''
}) => {
  const browserName = getBrowserName();
  const isSafari = browserName === 'safari';
  
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [loading, setLoading] = useState<boolean>(!isSafari); // Skip loading for Safari
  const [error, setError] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const [useFallback, setUseFallback] = useState<boolean>(isSafari); // Auto-enable for Safari
  const [workerRetryCount, setWorkerRetryCount] = useState<number>(0);
  
  // Text selection popup state
  const [showSelectionPopup, setShowSelectionPopup] = useState<boolean>(false);
  const [selectionData, setSelectionData] = useState<TextSelectionData | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // PDF URL - this would come from your API
  const pdfUrl = `/api/documents/${documentId}/pdf`;

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully:', { numPages, documentId });
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }, [documentId]);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error, { 
      documentId, 
      pdfUrl, 
      browser: browserName, 
      workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
      retryCount: workerRetryCount 
    });

    // Try fallback methods for Safari or after multiple failures
    if (browserName === 'safari' || workerRetryCount >= 2) {
      console.log('Switching to iframe fallback for PDF viewing');
      setUseFallback(true);
      setLoading(false);
      return;
    }

    // Try alternative worker URLs
    if (workerRetryCount < 2) {
      const workerUrls = [
        `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`,
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`,
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
      ];
      
      const nextWorkerUrl = workerUrls[workerRetryCount + 1];
      if (nextWorkerUrl) {
        console.log(`Retrying with worker URL ${workerRetryCount + 1}:`, nextWorkerUrl);
        pdfjs.GlobalWorkerOptions.workerSrc = nextWorkerUrl;
        setWorkerRetryCount(prev => prev + 1);
        setTimeout(() => setLoading(true), 1000); // Retry after delay
        return;
      }
    }

    setError(`Failed to load PDF: ${error.message}`);
    setLoading(false);
  }, [documentId, pdfUrl, browserName, workerRetryCount]);

  const onPageLoadError = useCallback((error: Error) => {
    setError(`Failed to load page: ${error.message}`);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, numPages));
  }, [numPages]);

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.2, 3.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  }, []);

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `document-${documentId}.pdf`;
    link.click();
  }, [documentId, pdfUrl]);

  const tryFallbackViewer = useCallback(() => {
    console.log('Trying iframe fallback for PDF viewing');
    setUseFallback(true);
    setError(null);
    setLoading(false);
  }, []);

  const resetToReactPDF = useCallback(() => {
    console.log('Resetting to react-pdf viewer');
    setUseFallback(false);
    setError(null);
    setLoading(true);
    setWorkerRetryCount(0);
    setupPDFWorker();
  }, []);

  // Handle text selection with popup
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const text = selection.toString().trim();
      
      // Get selection position for popup placement
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      const selectionData: TextSelectionData = {
        text,
        pageNumber: currentPage,
        position: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      };
      
      // Update states
      const textSelection: TextSelection = {
        text,
        pageNumber: currentPage
      };
      setSelectedText(textSelection);
      setSelectionData(selectionData);
      setShowSelectionPopup(true);
      
      // Add visual highlight to selected text
      try {
        const span = document.createElement('span');
        span.className = 'selected-text-highlight';
        span.style.cssText = `
          background: linear-gradient(120deg, rgba(59, 130, 246, 0.3) 0%, rgba(16, 185, 129, 0.3) 100%);
          border-radius: 2px;
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.4);
          animation: pulse 2s infinite;
        `;
        
        // Add animation keyframes if not already present
        if (!document.getElementById('selection-animation-styles')) {
          const style = document.createElement('style');
          style.id = 'selection-animation-styles';
          style.textContent = `
            @keyframes pulse {
              0%, 100% { opacity: 0.7; }
              50% { opacity: 1; }
            }
            .selected-text-highlight {
              transition: all 0.3s ease;
            }
          `;
          document.head.appendChild(style);
        }
      } catch (error) {
        console.warn('Could not add text highlight:', error);
      }
      
      // Call legacy callback if provided (for backwards compatibility)
      if (onTextSelection) {
        onTextSelection(text, currentPage);
      }
      
      console.log('📝 Text selected:', { 
        text: text.substring(0, 50) + '...', 
        page: currentPage,
        browser: browserName 
      });
      
      // Don't clear selection immediately - let popup handle it
    }
  }, [currentPage, onTextSelection, browserName]);

  // Handle popup action clicks
  const handleTextAction = useCallback((actionId: string, selectionData: TextSelectionData) => {
    console.log('🎯 Text action triggered:', { action: actionId, text: selectionData.text.substring(0, 30) + '...' });
    
    if (onTextAction) {
      onTextAction(actionId, selectionData.text, selectionData.pageNumber);
    }
    
    // Clear selection after action
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }, [onTextAction]);

  // Handle popup close
  const handleClosePopup = useCallback(() => {
    setShowSelectionPopup(false);
    setSelectionData(null);
    
    // Remove any highlight overlays
    const highlights = document.querySelectorAll('.selected-text-highlight');
    highlights.forEach(highlight => highlight.remove());
    
    // Clear text selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  }, []);

  // Debug: Log when component mounts and browser detection
  useEffect(() => {
    console.log('PDFViewer initialized:', { 
      documentId, 
      pdfUrl, 
      browser: browserName,
      isSafari,
      useFallback,
      loading 
    });

    // Log Safari-specific handling
    if (isSafari) {
      console.log('🦊 Safari detected: Using iframe PDF viewer for optimal compatibility');
    } else {
      console.log('🚀 Non-Safari browser: Attempting react-pdf with fallback support');
    }
  }, [documentId, pdfUrl, browserName, isSafari, useFallback, loading]);

  // Add event listener for text selection
  useEffect(() => {
    const handleMouseUp = () => {
      handleTextSelection();
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleTextSelection]);

  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
    }
  }, [numPages]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full bg-secondary-50 ${className}`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error && !useFallback) {
    return (
      <div className={`flex items-center justify-center h-full bg-secondary-50 ${className}`}>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-error-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-error-600" />
          </div>
          <h3 className="text-lg font-medium text-secondary-900 mb-2">
            Failed to Load PDF
          </h3>
          <p className="text-secondary-600 text-sm mb-4">
            {error}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={tryFallbackViewer}
              className="btn btn-secondary btn-sm"
            >
              Try Alternative Viewer
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary btn-sm"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Enhanced iframe viewer for Safari and fallback compatibility
  if (useFallback) {
    return (
      <div className={`flex flex-col h-full bg-secondary-50 ${className}`}>
        {/* Enhanced toolbar for fallback */}
        <div className="flex items-center justify-between bg-white border-b border-secondary-200 px-4 py-3">
          <div className="flex items-center space-x-3">
            {isSafari ? (
              <div className="flex items-center space-x-2">
                <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                  Safari Optimized
                </span>
                <span className="text-sm text-secondary-600">
                  PDF Viewer
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  Compatibility Mode
                </span>
                <span className="text-sm text-secondary-600">
                  PDF Viewer
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {!isSafari && (
              <button
                onClick={resetToReactPDF}
                className="btn btn-secondary btn-sm"
                title="Try Advanced Viewer"
              >
                Switch Viewer
              </button>
            )}
            <button
              onClick={handleDownload}
              className="btn btn-primary btn-sm"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Enhanced iframe PDF viewer */}
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&page=1&zoom=page-fit&view=FitH`}
            className="w-full h-full border-0 bg-white"
            title={`PDF Document ${documentId}`}
            onLoad={() => {
              console.log('✅ PDF iframe loaded successfully for', browserName);
              setLoading(false);
            }}
            onError={(e) => {
              console.error('❌ PDF iframe load error:', e);
              setError('Failed to load PDF. Please try downloading the file.');
            }}
            style={{
              backgroundColor: 'white',
              minHeight: '100%'
            }}
          />
          
          {/* Safari-specific help text */}
          {isSafari && (
            <div className="absolute top-2 left-2 right-2 pointer-events-none">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 shadow-sm">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Safari PDF Viewer</span>
                </div>
                <p className="mt-1 text-xs">
                  Using Safari's built-in PDF viewer for best compatibility. Use browser zoom controls if needed.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-secondary-50 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white border-b border-secondary-200 px-4 py-3">
        <div className="flex items-center space-x-3">
          {/* Page Navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="btn btn-secondary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={currentPage}
                onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-sm border border-secondary-300 rounded text-center"
                min="1"
                max={numPages}
              />
              <span className="text-sm text-secondary-600">
                of {numPages}
              </span>
            </div>
            
            <button
              onClick={handleNextPage}
              disabled={currentPage >= numPages}
              className="btn btn-secondary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Zoom Controls */}
          <button
            onClick={handleZoomOut}
            className="btn btn-secondary btn-sm"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          
          <span className="text-sm text-secondary-600 min-w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <button
            onClick={handleZoomIn}
            className="btn btn-secondary btn-sm"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Alternative Viewer Button */}
          <button
            onClick={tryFallbackViewer}
            className="btn btn-secondary btn-sm ml-2"
            title="Try Compatibility Mode"
          >
            <AlertCircle className="w-4 h-4" />
          </button>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="btn btn-secondary btn-sm"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-secondary-100 p-4"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex justify-center">
          <div 
            ref={documentRef}
            className="bg-white shadow-lg"
            style={{ 
              maxWidth: 'fit-content',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              MozUserSelect: 'text'
            }}
          >
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                scale={scale}
                onLoadError={onPageLoadError}
                className="pdf-page"
                loading={
                  <div className="flex items-center justify-center h-96 bg-white">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                }
                renderTextLayer={true}
                renderAnnotationLayer={false}
              />
            </Document>
            
            {/* Selection feedback overlay */}
            {selectedText && (
              <div className="absolute top-2 right-2 pointer-events-none">
                <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full shadow-lg flex items-center space-x-1 animate-bounce">
                  <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
                  <span>🎯 Text Selected!</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Text Selection Popup */}
      <TextSelectionPopup
        isVisible={showSelectionPopup}
        selectionData={selectionData}
        onAction={handleTextAction}
        onClose={handleClosePopup}
      />
      
      {/* Global selection status indicator */}
      {selectedText && !showSelectionPopup && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40 pointer-events-none">
          <div className="bg-gradient-to-r from-blue-500 to-green-500 text-white text-sm px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-pulse">
            <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
            <span>📝 Text ready for AI analysis!</span>
            <span className="text-xs opacity-75">({selectedText.text.length} chars selected)</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;