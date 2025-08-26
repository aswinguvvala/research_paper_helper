import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';

import { EducationLevel } from '@/types';
import PDFViewer from '@/components/PDFViewer';
import ChatInterface from '@/components/ChatInterface';

const DocumentViewerPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const [educationLevel] = useState<EducationLevel>(
    (searchParams.get('level') as EducationLevel) || EducationLevel.UNDERGRADUATE
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');

  // Document data from API
  const [documentData, setDocumentData] = useState<any>(null);

  useEffect(() => {
    const loadDocument = async () => {
      if (!documentId) {
        setError('Document ID not provided');
        setIsLoading(false);
        return;
      }

      try {
        // Call real API to get document metadata
        const response = await fetch(`/api/documents/${documentId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.statusText}`);
        }
        
        const documentData = await response.json();
        setDocumentData(documentData);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load document:', error);
        setError(error instanceof Error ? error.message : 'Failed to load document');
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [documentId]);

  const handleTextSelection = (text: string) => {
    setSelectedText(text);
  };

  const handleTextAction = (action: string, text: string, pageNumber?: number) => {
    console.log('DocumentViewerPage: Handling text action', { action, textLength: text?.length, pageNumber, hasText: !!text });
    
    try {
      if (!text || typeof text !== 'string') {
        console.error('DocumentViewerPage: Invalid text provided to handleTextAction', { action, text, pageNumber });
        return;
      }

      switch (action) {
        case 'explain':
          console.log('DocumentViewerPage: Setting explain text');
          setSelectedText(`Can you explain this selected text: "${text}"`);
          break;
        case 'simplify':
          console.log('DocumentViewerPage: Setting simplify text');
          setSelectedText(`Can you simplify and break down this text in simple terms: "${text}"`);
          break;
        case 'followup':
          console.log('DocumentViewerPage: Setting followup text');
          setSelectedText(`What follow-up questions should I ask about this text: "${text}"`);
          break;
        case 'bookmark':
          console.log('DocumentViewerPage: Bookmark action - to be implemented');
          // TODO: Implement bookmarking system
          break;
        default:
          console.log('DocumentViewerPage: Setting raw text');
          setSelectedText(text);
      }
      
      console.log('DocumentViewerPage: Text action handled successfully');
    } catch (error) {
      console.error('DocumentViewerPage: Error in handleTextAction', { error, action, text, pageNumber });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !documentData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-error-600 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-secondary-900 mb-2">
            Document Not Found
          </h1>
          <p className="text-secondary-600 mb-6">
            {error || 'The document you requested could not be found.'}
          </p>
          <a href="/" className="btn btn-primary">
            Go Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="h-screen flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Document Header */}
      <div className="bg-white border-b border-secondary-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-secondary-900 truncate">
              {documentData.title || documentData.filename}
            </h1>
            {documentData.authors && (
              <p className="text-sm text-secondary-600 mt-1">
                by {documentData.authors.join(', ')}
              </p>
            )}
          </div>
          
          <div className="flex items-center space-x-4 ml-4">
            {/* Education Level Indicator */}
            <div className="text-sm text-secondary-600">
              Level: <span className="font-medium capitalize">{educationLevel.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer (Left Panel) */}
        <div className="flex-1 bg-secondary-100">
          <PDFViewer 
            documentId={documentId!}
            onTextSelection={handleTextSelection}
            onTextAction={handleTextAction}
            className="h-full"
          />
        </div>

        {/* Resizable Divider */}
        <div className="w-1 bg-secondary-200 cursor-col-resize hover:bg-secondary-300 transition-colors" />

        {/* Chat Interface (Right Panel) */}
        <div className="w-96 bg-white border-l border-secondary-200 flex flex-col">
          <ChatInterface 
            documentId={documentId!}
            educationLevel={educationLevel}
            selectedText={selectedText}
            className="h-full"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default DocumentViewerPage;