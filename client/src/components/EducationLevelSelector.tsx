import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

import { EducationLevel } from '@/types';

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
  const [isOpen, setIsOpen] = useState(false);
  const currentConfig = EDUCATION_LEVEL_CONFIG[value];

  const handleSelect = (level: EducationLevel) => {
    onChange(level);
    setIsOpen(false);
  };

  return (
    <div className={clsx('relative', className)}>
      <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
        Select Education Level
      </label>
      
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'w-full bg-white/90 backdrop-blur-sm border border-secondary-300 rounded-lg px-4 py-3 text-left',
          'dark:bg-secondary-800/90 dark:border-secondary-600',
          'flex items-center justify-between',
          'focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
          'transition-all duration-200',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-secondary-400 dark:hover:border-secondary-500 cursor-pointer'
        )}
      >
        <div>
          <div className="font-medium text-secondary-900 dark:text-white">
            {currentConfig.label}
          </div>
          <div className="text-sm text-secondary-600 dark:text-secondary-300 mt-0.5">
            {currentConfig.description}
          </div>
        </div>
        <ChevronDown 
          className={clsx(
            'w-5 h-5 text-secondary-400 dark:text-secondary-300 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white/95 backdrop-blur-sm border border-secondary-200 rounded-lg shadow-lg z-50 dark:bg-secondary-800/95 dark:border-secondary-600"
        >
          <div className="py-1">
            {Object.entries(EDUCATION_LEVEL_CONFIG).map(([level, config]) => (
              <button
                key={level}
                onClick={() => handleSelect(level as EducationLevel)}
                className={clsx(
                  'w-full text-left px-4 py-3 hover:bg-secondary-100 dark:hover:bg-secondary-700',
                  'focus:bg-secondary-100 dark:focus:bg-secondary-700 focus:outline-none',
                  'transition-colors duration-150',
                  'flex items-center justify-between'
                )}
              >
                <div>
                  <div className="font-medium text-secondary-900 dark:text-white">{config.label}</div>
                  <div className="text-sm text-secondary-600 dark:text-secondary-300 mt-0.5">{config.description}</div>
                </div>
                {level === value && <Check className="w-5 h-5 text-primary-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EducationLevelSelector;