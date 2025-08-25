import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

import { EducationLevel } from '@/types';

// Education level configuration
const EDUCATION_LEVEL_CONFIG = {
  [EducationLevel.NO_TECHNICAL]: {
    label: 'General Reader',
    description: 'No technical background'
  },
  [EducationLevel.HIGH_SCHOOL]: {
    label: 'High School',
    description: 'High school level'
  },
  [EducationLevel.UNDERGRADUATE]: {
    label: 'Undergraduate',
    description: 'Bachelor\'s degree level'
  },
  [EducationLevel.MASTERS]: {
    label: 'Graduate',
    description: 'Master\'s degree level'
  },
  [EducationLevel.PHD]: {
    label: 'PhD/Research',
    description: 'Doctoral level'
  }
};

interface EducationLevelSelectorProps {
  value: EducationLevel;
  onChange: (level: EducationLevel) => void;
  className?: string;
  disabled?: boolean;
}

const EducationLevelSelector: React.FC<EducationLevelSelectorProps> = ({
  value,
  onChange,
  className,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const currentConfig = EDUCATION_LEVEL_CONFIG[value];

  const handleSelect = (level: EducationLevel) => {
    onChange(level);
    setIsOpen(false);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-education-selector]')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className={clsx('relative', className)} data-education-selector>
      <label className="block text-sm font-medium text-secondary-700 mb-2">
        Education Level
      </label>
      
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'w-full bg-white border border-secondary-300 rounded-lg px-4 py-3 text-left',
          'flex items-center justify-between',
          'focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
          'transition-all duration-200',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-secondary-400 cursor-pointer'
        )}
      >
        <div>
          <div className="font-medium text-secondary-900">
            {currentConfig.label}
          </div>
          <div className="text-sm text-secondary-600 mt-0.5">
            {currentConfig.description}
          </div>
        </div>
        <ChevronDown 
          className={clsx(
            'w-5 h-5 text-secondary-400 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-secondary-200 rounded-lg shadow-popup z-50"
        >
          <div className="py-1">
            {Object.entries(EDUCATION_LEVEL_CONFIG).map(([level, config]) => (
              <button
                key={level}
                onClick={() => handleSelect(level as EducationLevel)}
                className={clsx(
                  'w-full text-left px-4 py-3 hover:bg-secondary-50',
                  'focus:bg-secondary-50 focus:outline-none',
                  'transition-colors duration-150',
                  level === value && 'bg-primary-50 text-primary-700'
                )}
              >
                <div className="font-medium">
                  {config.label}
                </div>
                <div className="text-sm text-secondary-600 mt-0.5">
                  {config.description}
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default EducationLevelSelector;