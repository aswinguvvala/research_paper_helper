import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Trash2, MessageCircle, Copy, Palette } from 'lucide-react';
import clsx from 'clsx';
import { Highlight, HighlightColor, highlightManager } from '@/services/highlightManager';

interface HighlightOverlayProps {
  documentId: string;
  pageNumber: number;
  scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onHighlightClick?: (highlight: Highlight) => void;
  className?: string;
}

interface HighlightTooltipProps {
  highlight: Highlight;
  position: { x: number; y: number };
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const HighlightTooltip: React.FC<HighlightTooltipProps> = ({
  highlight,
  position,
  onEdit,
  onDelete,
  onClose
}) => {
  const colors = highlightManager.getHighlightColors();
  const colorConfig = colors[highlight.color];

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(highlight.selectedText).catch(error => {
      console.error('Failed to copy text:', error);
    });
    onClose();
  }, [highlight.selectedText, onClose]);

  return (
    <motion.div
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-secondary-200 p-3 min-w-64 max-w-80"
      style={{
        top: position.y - 10,
        left: position.x
      }}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.15 }}
    >
      {/* Header with color indicator */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div
            className="w-3 h-3 rounded-full border-2"
            style={{
              backgroundColor: colorConfig.background,
              borderColor: colorConfig.border
            }}
          />
          <span className="text-xs font-medium text-secondary-700">
            Page {highlight.pageNumber}
          </span>
          <span className="text-xs text-secondary-500">
            {new Date(highlight.createdAt).toLocaleDateString()}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-secondary-400 hover:text-secondary-600 text-sm"
        >
          ×
        </button>
      </div>

      {/* Selected text preview */}
      <div className="bg-secondary-50 rounded-lg p-2 mb-3 border-l-3" style={{ borderLeftColor: colorConfig.border }}>
        <p className="text-sm text-secondary-800 line-clamp-3">
          "{highlight.selectedText.length > 100 
            ? highlight.selectedText.substring(0, 100) + '...'
            : highlight.selectedText}"
        </p>
      </div>

      {/* Notes section */}
      {highlight.notes && (
        <div className="mb-3">
          <div className="flex items-center space-x-1 mb-1">
            <MessageCircle className="w-3 h-3 text-secondary-500" />
            <span className="text-xs font-medium text-secondary-700">Notes</span>
          </div>
          <p className="text-sm text-secondary-600 bg-secondary-25 rounded p-2">
            {highlight.notes}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-secondary-100">
        <div className="flex items-center space-x-1">
          <button
            onClick={onEdit}
            className="flex items-center space-x-1 px-2 py-1 text-xs bg-primary-50 text-primary-700 rounded hover:bg-primary-100 transition-colors"
            title="Edit highlight"
          >
            <Edit3 className="w-3 h-3" />
            <span>Edit</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2 py-1 text-xs bg-secondary-50 text-secondary-700 rounded hover:bg-secondary-100 transition-colors"
            title="Copy text"
          >
            <Copy className="w-3 h-3" />
            <span>Copy</span>
          </button>
        </div>
        <button
          onClick={onDelete}
          className="flex items-center space-x-1 px-2 py-1 text-xs bg-error-50 text-error-700 rounded hover:bg-error-100 transition-colors"
          title="Delete highlight"
        >
          <Trash2 className="w-3 h-3" />
          <span>Delete</span>
        </button>
      </div>
    </motion.div>
  );
};

const HighlightOverlay: React.FC<HighlightOverlayProps> = ({
  documentId,
  pageNumber,
  scale,
  containerRef,
  onHighlightClick,
  className
}) => {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<{
    highlight: Highlight;
    position: { x: number; y: number };
  } | null>(null);
  const [hoveredHighlight, setHoveredHighlight] = useState<string | null>(null);

  // Load highlights for current page
  useEffect(() => {
    const loadHighlights = () => {
      const pageHighlights = highlightManager.getHighlightsForPage(documentId, pageNumber);
      setHighlights(pageHighlights);
    };

    loadHighlights();

    // Listen for highlight changes
    const handleHighlightChange = () => loadHighlights();
    highlightManager.addEventListener('highlight-created', handleHighlightChange);
    highlightManager.addEventListener('highlight-updated', handleHighlightChange);
    highlightManager.addEventListener('highlight-deleted', handleHighlightChange);

    return () => {
      highlightManager.removeEventListener('highlight-created', handleHighlightChange);
      highlightManager.removeEventListener('highlight-updated', handleHighlightChange);
      highlightManager.removeEventListener('highlight-deleted', handleHighlightChange);
    };
  }, [documentId, pageNumber]);

  // Handle highlight click
  const handleHighlightClick = useCallback((highlight: Highlight, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const position = {
      x: rect.left,
      y: rect.top
    };

    setActiveTooltip({ highlight, position });
    
    if (onHighlightClick) {
      onHighlightClick(highlight);
    }

    console.log('Highlight clicked:', { 
      id: highlight.id, 
      color: highlight.color,
      text: highlight.selectedText.substring(0, 30) + '...'
    });
  }, [onHighlightClick]);

  // Handle highlight edit
  const handleEditHighlight = useCallback(async (highlight: Highlight) => {
    // For now, just toggle through colors as a simple edit
    const colors: HighlightColor[] = ['yellow', 'blue', 'green', 'pink', 'orange', 'purple', 'red'];
    const currentIndex = colors.indexOf(highlight.color);
    const nextColor = colors[(currentIndex + 1) % colors.length];

    try {
      await highlightManager.updateHighlight(highlight.id, { color: nextColor });
      setActiveTooltip(null);
    } catch (error) {
      console.error('Failed to update highlight:', error);
    }
  }, []);

  // Handle highlight delete
  const handleDeleteHighlight = useCallback(async (highlight: Highlight) => {
    try {
      await highlightManager.deleteHighlight(highlight.id);
      setActiveTooltip(null);
    } catch (error) {
      console.error('Failed to delete highlight:', error);
    }
  }, []);

  // Close tooltip
  const handleCloseTooltip = useCallback(() => {
    setActiveTooltip(null);
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeTooltip) {
        setActiveTooltip(null);
      }
    };

    if (activeTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeTooltip]);

  const colors = highlightManager.getHighlightColors();

  return (
    <>
      {/* Highlight overlays */}
      <div className={clsx('absolute inset-0 pointer-events-none', className)}>
        <AnimatePresence>
          {highlights.map((highlight) => {
            if (!highlight.boundingBox) return null;

            const colorConfig = colors[highlight.color];
            const isHovered = hoveredHighlight === highlight.id;
            
            return (
              <motion.div
                key={highlight.id}
                className="absolute pointer-events-auto cursor-pointer transition-all duration-200"
                style={{
                  left: highlight.boundingBox.x * scale,
                  top: highlight.boundingBox.y * scale,
                  width: highlight.boundingBox.width * scale,
                  height: highlight.boundingBox.height * scale,
                  backgroundColor: colorConfig.background,
                  borderColor: colorConfig.border,
                  borderWidth: isHovered ? 2 : 1,
                  borderStyle: 'solid',
                  borderRadius: '3px',
                  boxShadow: isHovered 
                    ? `0 0 0 2px ${colorConfig.border}33, 0 4px 12px rgba(0,0,0,0.15)`
                    : `0 0 0 1px ${colorConfig.border}33`
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: isHovered ? 1.02 : 1,
                  backgroundColor: colorConfig.background
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => handleHighlightClick(highlight, e)}
                onMouseEnter={() => setHoveredHighlight(highlight.id)}
                onMouseLeave={() => setHoveredHighlight(null)}
                title={`${highlight.selectedText.substring(0, 50)}${highlight.selectedText.length > 50 ? '...' : ''}`}
              >
                {/* Highlight shimmer effect on hover */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r opacity-30"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${colorConfig.border}66, transparent)`
                      }}
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </AnimatePresence>

                {/* Pulse indicator for new highlights */}
                {highlight.createdAt && (Date.now() - highlight.createdAt.getTime()) < 3000 && (
                  <motion.div
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                    style={{ backgroundColor: colorConfig.border }}
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [1, 0.5, 1]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Highlight tooltip */}
      <AnimatePresence>
        {activeTooltip && (
          <HighlightTooltip
            highlight={activeTooltip.highlight}
            position={activeTooltip.position}
            onEdit={() => handleEditHighlight(activeTooltip.highlight)}
            onDelete={() => handleDeleteHighlight(activeTooltip.highlight)}
            onClose={handleCloseTooltip}
          />
        )}
      </AnimatePresence>

      {/* Highlight stats indicator */}
      {highlights.length > 0 && (
        <motion.div
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 text-xs font-medium text-secondary-700 shadow-sm border border-secondary-200"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {highlights.length} highlight{highlights.length !== 1 ? 's' : ''}
        </motion.div>
      )}
    </>
  );
};

export default HighlightOverlay;