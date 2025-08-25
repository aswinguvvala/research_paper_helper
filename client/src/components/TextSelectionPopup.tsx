import React, { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, BookOpen, MessageSquare, Copy, Bookmark, X } from 'lucide-react';
import clsx from 'clsx';

export interface TextSelectionData {
  text: string;
  pageNumber?: number;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TextSelectionAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  primary?: boolean;
}

export interface TextSelectionPopupProps {
  isVisible: boolean;
  selectionData: TextSelectionData | null;
  onAction: (actionId: string, selectionData: TextSelectionData) => void;
  onClose: () => void;
  className?: string;
}

const defaultActions: TextSelectionAction[] = [
  {
    id: 'explain',
    label: 'Explain',
    icon: Brain,
    description: 'Get AI explanation adapted to your education level',
    primary: true
  },
  {
    id: 'simplify',
    label: 'Simplify',
    icon: BookOpen,
    description: 'Break down complex concepts in simple terms'
  },
  {
    id: 'followup',
    label: 'Ask More',
    icon: MessageSquare,
    description: 'Generate follow-up questions about this topic'
  },
  {
    id: 'bookmark',
    label: 'Bookmark',
    icon: Bookmark,
    description: 'Save this text for later reference'
  },
  {
    id: 'copy',
    label: 'Copy',
    icon: Copy,
    description: 'Copy text to clipboard'
  }
];

const TextSelectionPopup: React.FC<TextSelectionPopupProps> = ({
  isVisible,
  selectionData,
  onAction,
  onClose,
  className
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  // Calculate popup position to avoid viewport edges
  const getPopupPosition = useCallback(() => {
    if (!selectionData) return { top: 0, left: 0 };

    const { position } = selectionData;
    const popup = popupRef.current;
    if (!popup) return { top: position.y, left: position.x };

    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let top = position.y - popupRect.height - 10; // 10px gap above selection
    let left = position.x + position.width / 2 - popupRect.width / 2; // Center horizontally

    // Adjust if popup would go off screen
    if (top < 10) {
      top = position.y + position.height + 10; // Show below selection instead
    }
    
    if (left < 10) {
      left = 10;
    } else if (left + popupRect.width > viewportWidth - 10) {
      left = viewportWidth - popupRect.width - 10;
    }

    return { top, left };
  }, [selectionData]);

  // Handle action clicks
  const handleActionClick = useCallback((actionId: string) => {
    console.log('🎬 TextSelectionPopup: Action clicked', { actionId, hasSelectionData: !!selectionData });
    
    if (!selectionData) {
      console.warn('❌ TextSelectionPopup: No selection data available for action', actionId);
      return;
    }

    try {
      if (actionId === 'copy') {
        // Handle copy action locally
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(selectionData.text).then(() => {
            console.log('✅ Text copied to clipboard');
          }).catch(err => {
            console.error('❌ Failed to copy text:', err);
            // Fallback: try to use document.execCommand
            try {
              const textArea = document.createElement('textarea');
              textArea.value = selectionData.text;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              console.log('✅ Text copied using fallback method');
            } catch (fallbackErr) {
              console.error('❌ Fallback copy also failed:', fallbackErr);
            }
          });
        } else {
          console.warn('❌ Clipboard API not available');
        }
      } else {
        // Pass other actions to parent
        console.log('🎯 TextSelectionPopup: Calling onAction', { actionId, text: selectionData.text.substring(0, 50) + '...' });
        onAction(actionId, selectionData);
      }
      
      onClose();
    } catch (error) {
      console.error('❌ TextSelectionPopup: Error in handleActionClick', { error, actionId, selectionData });
      // Don't close the popup if there's an error, let user try again
    }
  }, [selectionData, onAction, onClose]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onClose]);

  if (!isVisible || !selectionData) {
    return null;
  }

  const position = getPopupPosition();

  return (
    <AnimatePresence>
      <motion.div
        ref={popupRef}
        className={clsx(
          'fixed z-50 bg-white rounded-lg shadow-lg border border-secondary-200',
          'min-w-64 max-w-80 p-3',
          className
        )}
        style={{
          top: position.top,
          left: position.left
        }}
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header with selected text preview */}
        <div className="mb-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <h3 className="text-sm font-medium text-secondary-900">
                🎯 Text Ready for AI Analysis
                {selectionData.pageNumber && (
                  <span className="text-xs text-secondary-500 ml-2">
                    Page {selectionData.pageNumber}
                  </span>
                )}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-secondary-400 hover:text-secondary-600 transition-colors p-1"
              title="Close"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          
          <div className="text-xs text-secondary-700 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-3 max-h-20 overflow-y-auto">
            <div className="flex items-start space-x-2">
              <span className="text-blue-600 font-medium">“</span>
              <span className="flex-1">{selectionData.text.substring(0, 150)}{selectionData.text.length > 150 ? '...' : ''}</span>
              <span className="text-blue-600 font-medium">”</span>
            </div>
          </div>
          
          <div className="mt-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1 flex items-center space-x-1">
            <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
            <span>✨ Choose an action below or send to chat directly</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {/* Primary AI actions */}
          <div className="bg-gradient-to-r from-primary-25 to-blue-25 rounded-lg p-2 border border-primary-200">
            <p className="text-xs font-medium text-primary-700 mb-2 text-center">
              🤖 AI-Powered Analysis
            </p>
            <div className="space-y-1">
              {defaultActions.slice(0, 3).map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action.id)}
                    className={clsx(
                      'w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-all hover:scale-105',
                      action.primary
                        ? 'bg-primary-100 text-primary-800 hover:bg-primary-200 border border-primary-300 shadow-sm'
                        : 'text-primary-700 hover:bg-primary-50 bg-white border border-primary-200'
                    )}
                    title={action.description}
                  >
                    <Icon className={clsx(
                      'w-4 h-4 flex-shrink-0',
                      action.primary ? 'text-primary-700' : 'text-primary-600'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {action.label}
                      </div>
                      <div className="text-xs text-primary-600 truncate">
                        {action.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Secondary actions */}
          <div className="space-y-1">
            {defaultActions.slice(3).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action.id)}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-colors text-secondary-700 hover:bg-secondary-50 border border-secondary-200"
                  title={action.description}
                >
                  <Icon className="w-4 h-4 flex-shrink-0 text-secondary-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {action.label}
                    </div>
                    <div className="text-xs text-secondary-500 truncate">
                      {action.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer tip */}
        <div className="mt-3 pt-2 border-t border-secondary-100">
          <div className="flex items-center justify-between text-xs text-secondary-500">
            <div className="flex items-center space-x-1">
              <span>🎨</span>
              <span>Text is ready for chat!</span>
            </div>
            <span>
              Press <kbd className="px-1 py-0.5 bg-secondary-100 rounded text-xs">Esc</kbd> to close
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TextSelectionPopup;