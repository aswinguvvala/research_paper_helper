import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Check } from 'lucide-react';
import clsx from 'clsx';
import { HighlightColor, highlightManager } from '@/services/highlightManager';

interface HighlightColorPickerProps {
  selectedColor: HighlightColor;
  onColorSelect: (color: HighlightColor) => void;
  onClose?: () => void;
  className?: string;
  compact?: boolean;
}

const colorLabels: Record<HighlightColor, string> = {
  yellow: 'Classic Yellow',
  blue: 'Ocean Blue', 
  green: 'Nature Green',
  pink: 'Soft Pink',
  orange: 'Vibrant Orange',
  purple: 'Royal Purple',
  red: 'Alert Red'
};

const HighlightColorPicker: React.FC<HighlightColorPickerProps> = ({
  selectedColor,
  onColorSelect,
  onClose,
  className,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const colors = highlightManager.getHighlightColors();

  const handleColorClick = useCallback((color: HighlightColor) => {
    onColorSelect(color);
    setIsExpanded(false);
    
    console.log('Color selected:', color);
  }, [onColorSelect]);

  const handleToggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  if (compact) {
    return (
      <div className={clsx('relative', className)}>
        <button
          onClick={handleToggleExpanded}
          className="flex items-center space-x-2 px-3 py-2 bg-white border border-secondary-200 rounded-lg hover:bg-secondary-50 transition-colors"
          title="Choose highlight color"
        >
          <div
            className="w-4 h-4 rounded-full border-2"
            style={{
              backgroundColor: colors[selectedColor].background,
              borderColor: colors[selectedColor].border
            }}
          />
          <Palette className="w-4 h-4 text-secondary-600" />
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="absolute top-full mt-2 bg-white rounded-lg shadow-lg border border-secondary-200 p-3 z-50"
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(colors) as HighlightColor[]).map(color => {
                  const config = colors[color];
                  const isSelected = color === selectedColor;
                  
                  return (
                    <motion.button
                      key={color}
                      onClick={() => handleColorClick(color)}
                      className={clsx(
                        'w-8 h-8 rounded-full border-2 relative transition-all duration-200 hover:scale-110',
                        isSelected ? 'ring-2 ring-secondary-400' : ''
                      )}
                      style={{
                        backgroundColor: config.background,
                        borderColor: config.border
                      }}
                      title={colorLabels[color]}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {isSelected && (
                        <motion.div
                          className="absolute inset-0 flex items-center justify-center"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400 }}
                        >
                          <Check className="w-3 h-3" style={{ color: config.text }} />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
              
              {onClose && (
                <div className="mt-3 pt-2 border-t border-secondary-100">
                  <button
                    onClick={onClose}
                    className="text-xs text-secondary-500 hover:text-secondary-700 transition-colors"
                  >
                    Close picker
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-3', className)}>
      <div className="flex items-center space-x-2">
        <Palette className="w-4 h-4 text-secondary-600" />
        <h3 className="text-sm font-medium text-secondary-900">Choose Highlight Color</h3>
      </div>

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {(Object.keys(colors) as HighlightColor[]).map(color => {
          const config = colors[color];
          const isSelected = color === selectedColor;
          
          return (
            <motion.button
              key={color}
              onClick={() => handleColorClick(color)}
              className={clsx(
                'flex flex-col items-center space-y-2 p-3 rounded-lg border-2 transition-all duration-200',
                isSelected 
                  ? 'border-secondary-400 bg-secondary-50' 
                  : 'border-transparent hover:border-secondary-200 hover:bg-secondary-25'
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div
                className={clsx(
                  'w-8 h-8 rounded-full border-2 relative',
                  isSelected ? 'ring-2 ring-secondary-300' : ''
                )}
                style={{
                  backgroundColor: config.background,
                  borderColor: config.border
                }}
              >
                {isSelected && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Check className="w-4 h-4" style={{ color: config.text }} />
                  </motion.div>
                )}
              </div>
              
              <span className="text-xs font-medium text-secondary-700 text-center leading-tight">
                {colorLabels[color]}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="text-xs text-secondary-500 text-center">
        Selected: <span className="font-medium">{colorLabels[selectedColor]}</span>
      </div>

      {onClose && (
        <div className="pt-2 border-t border-secondary-100 text-center">
          <button
            onClick={onClose}
            className="text-sm text-secondary-600 hover:text-secondary-800 transition-colors"
          >
            Close Color Picker
          </button>
        </div>
      )}
    </div>
  );
};

export default HighlightColorPicker;