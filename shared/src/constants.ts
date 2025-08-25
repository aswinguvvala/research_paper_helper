import { EducationLevel, SectionType } from './types';

// API endpoints and URLs
export const API_ENDPOINTS = {
  DOCUMENTS: '/api/documents',
  CHAT: '/api/chat',
  SEARCH: '/api/search',
  EMBEDDINGS: '/api/embeddings',
  HEALTH: '/api/health',
  SESSIONS: '/api/sessions'
} as const;

// AI service endpoints
export const AI_SERVICE_ENDPOINTS = {
  EMBEDDINGS: '/embeddings',
  HEALTH: '/health',
  MODEL_INFO: '/model'
} as const;

// Default configuration values
export const DEFAULT_CONFIG = {
  SERVER_PORT: 8000,
  CLIENT_PORT: 3000,
  AI_SERVICE_PORT: 5000,
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // AI service configuration
  DEFAULT_EMBEDDING_MODEL: 'all-MiniLM-L6-v2',
  EMBEDDING_DIMENSIONS: 384,
  EMBEDDING_BATCH_SIZE: 32,
  
  // OpenAI configuration
  OPENAI_MODEL: 'gpt-4o-mini',
  OPENAI_MAX_TOKENS: 4000,
  OPENAI_TEMPERATURE: 0.7,
  
  // Document processing
  MAX_DOCUMENT_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 200,
  
  // Search and retrieval
  DEFAULT_SEARCH_LIMIT: 10,
  SIMILARITY_THRESHOLD: 0.7,
  MAX_CONTEXT_CHUNKS: 5,
  
  // Session management
  MAX_CONCURRENT_SESSIONS: 50,
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  MAX_CONVERSATION_HISTORY: 50
} as const;

// Education level configurations
export const EDUCATION_LEVEL_CONFIG = {
  [EducationLevel.HIGH_SCHOOL]: {
    label: 'High School',
    description: 'Explanations with everyday analogies and minimal technical jargon',
    complexity: 1,
    vocabularyLevel: 'basic',
    maxTechnicalDepth: 2,
    preferAnalogies: true,
    exampleTypes: ['real-world', 'everyday']
  },
  [EducationLevel.UNDERGRADUATE]: {
    label: 'Undergraduate',
    description: 'Includes foundational concepts with clear technical explanations',
    complexity: 3,
    vocabularyLevel: 'intermediate',
    maxTechnicalDepth: 4,
    preferAnalogies: false,
    exampleTypes: ['academic', 'textbook']
  },
  [EducationLevel.MASTERS]: {
    label: 'Masters Level',
    description: 'Advanced knowledge with detailed technical context',
    complexity: 5,
    vocabularyLevel: 'advanced',
    maxTechnicalDepth: 6,
    preferAnalogies: false,
    exampleTypes: ['research', 'technical']
  },
  [EducationLevel.PHD]: {
    label: 'PhD Level',
    description: 'Comprehensive academic context with methodological details',
    complexity: 7,
    vocabularyLevel: 'expert',
    maxTechnicalDepth: 8,
    preferAnalogies: false,
    exampleTypes: ['research', 'methodological', 'theoretical']
  },
  [EducationLevel.NO_TECHNICAL]: {
    label: 'No Technical Background',
    description: 'Simple explanations focused on practical implications',
    complexity: 0,
    vocabularyLevel: 'simple',
    maxTechnicalDepth: 1,
    preferAnalogies: true,
    exampleTypes: ['metaphor', 'practical', 'intuitive']
  }
} as const;

// Section type configurations for document processing
export const SECTION_TYPE_CONFIG = {
  [SectionType.TITLE]: {
    weight: 1.0,
    searchPriority: 'high',
    contextImportance: 'critical'
  },
  [SectionType.ABSTRACT]: {
    weight: 0.9,
    searchPriority: 'high',
    contextImportance: 'high'
  },
  [SectionType.INTRODUCTION]: {
    weight: 0.8,
    searchPriority: 'high',
    contextImportance: 'high'
  },
  [SectionType.METHODOLOGY]: {
    weight: 0.9,
    searchPriority: 'medium',
    contextImportance: 'high'
  },
  [SectionType.RESULTS]: {
    weight: 0.9,
    searchPriority: 'high',
    contextImportance: 'high'
  },
  [SectionType.DISCUSSION]: {
    weight: 0.8,
    searchPriority: 'medium',
    contextImportance: 'medium'
  },
  [SectionType.CONCLUSION]: {
    weight: 0.8,
    searchPriority: 'medium',
    contextImportance: 'high'
  },
  [SectionType.REFERENCES]: {
    weight: 0.3,
    searchPriority: 'low',
    contextImportance: 'low'
  },
  [SectionType.FIGURE]: {
    weight: 0.6,
    searchPriority: 'medium',
    contextImportance: 'medium'
  },
  [SectionType.TABLE]: {
    weight: 0.7,
    searchPriority: 'medium',
    contextImportance: 'medium'
  },
  [SectionType.EQUATION]: {
    weight: 0.8,
    searchPriority: 'medium',
    contextImportance: 'high'
  },
  [SectionType.OTHER]: {
    weight: 0.5,
    searchPriority: 'low',
    contextImportance: 'medium'
  }
} as const;

// Error messages
export const ERROR_MESSAGES = {
  DOCUMENT_UPLOAD_FAILED: 'Failed to upload document. Please try again.',
  DOCUMENT_NOT_FOUND: 'Document not found or no longer available.',
  PROCESSING_TIMEOUT: 'Document processing timed out. Please try with a smaller file.',
  AI_SERVICE_UNAVAILABLE: 'AI service is temporarily unavailable. Please try again later.',
  INVALID_EDUCATION_LEVEL: 'Please select a valid education level.',
  CHAT_SESSION_EXPIRED: 'Chat session has expired. Please refresh the page.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait before trying again.',
  INVALID_FILE_TYPE: 'Please upload a PDF file.',
  FILE_TOO_LARGE: 'File is too large. Maximum size is 50MB.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  UNAUTHORIZED: 'Unauthorized access. Please log in again.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again.'
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  DOCUMENT_UPLOADED: 'Document uploaded successfully!',
  DOCUMENT_PROCESSED: 'Document processing completed.',
  SESSION_CREATED: 'New chat session created.',
  MESSAGE_SENT: 'Message sent successfully.',
  SETTINGS_SAVED: 'Settings saved successfully.'
} as const;

// UI constants
export const UI_CONSTANTS = {
  DEBOUNCE_DELAY: 300,
  TYPING_INDICATOR_DELAY: 500,
  AUTO_SAVE_DELAY: 1000,
  SCROLL_BEHAVIOR: 'smooth' as ScrollBehavior,
  
  // Breakpoints (matching Tailwind)
  BREAKPOINTS: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536
  },
  
  // Animation durations
  ANIMATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500
  },
  
  // Z-index layers
  Z_INDEX: {
    DROPDOWN: 1000,
    STICKY: 1020,
    FIXED: 1030,
    MODAL_BACKDROP: 1040,
    MODAL: 1050,
    POPOVER: 1060,
    TOOLTIP: 1070,
    TOAST: 1080
  }
} as const;

// Validation rules
export const VALIDATION_RULES = {
  FILENAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 255,
    ALLOWED_EXTENSIONS: ['.pdf']
  },
  MESSAGE: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 5000
  },
  SESSION_ID: {
    PATTERN: /^[a-zA-Z0-9-_]{1,50}$/
  },
  DOCUMENT_ID: {
    PATTERN: /^[a-zA-Z0-9-_]{1,50}$/
  }
} as const;

// Feature flags (can be overridden by environment)
export const FEATURE_FLAGS = {
  ENABLE_ADVANCED_WORKFLOWS: true,
  ENABLE_CACHING: true,
  ENABLE_METRICS: false,
  ENABLE_DEBUG_MODE: false,
  ENABLE_OFFLINE_MODE: false,
  ENABLE_MULTI_DOCUMENT: false
} as const;

// Theme and styling constants
export const THEME = {
  COLORS: {
    PRIMARY: {
      50: '#eff6ff',
      100: '#dbeafe', 
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8'
    },
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
    ERROR: '#ef4444',
    INFO: '#3b82f6'
  },
  SPACING: {
    XS: '0.25rem',
    SM: '0.5rem', 
    MD: '1rem',
    LG: '1.5rem',
    XL: '2rem'
  }
} as const;