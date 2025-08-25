// Education levels for adaptive explanations
export enum EducationLevel {
  HIGH_SCHOOL = 'high_school',
  UNDERGRADUATE = 'undergraduate',
  MASTERS = 'masters',
  PHD = 'phd',
  NO_TECHNICAL = 'no_technical'
}

// Chat message roles
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

// Document metadata interface
export interface DocumentMetadata {
  id: string;
  filename: string;
  title?: string;
  authors?: string[];
  abstract?: string;
  uploadedAt: Date;
  processedAt?: Date;
  totalPages: number;
  totalChunks: number;
  fileSize: number;
  mimeType: string;
}

// Chat message interface
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: {
    documentId?: string;
    educationLevel?: EducationLevel;
    citations?: Citation[];
  };
}

// Citation interface
export interface Citation {
  chunkId: string;
  pageNumber: number;
  confidence: number;
  relevanceScore?: number;
}

// API Request/Response interfaces
export interface ChatRequest {
  message: string;
  documentId: string;
  educationLevel: EducationLevel;
  conversationHistory?: ChatMessage[];
  highlightedText?: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  confidence: number;
  suggestedQuestions: string[];
  processingTime: number;
}

// Upload interfaces
export interface UploadDocumentRequest {
  file: File;
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
    preserveStructure?: boolean;
    extractMetadata?: boolean;
  };
}

export interface UploadDocumentResponse {
  document: DocumentMetadata;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
}

// Search interfaces
export interface SearchRequest {
  query: string;
  documentId: string;
  filters?: {
    sectionTypes?: string[];
    pageRange?: [number, number];
  };
  limit?: number;
  similarityThreshold?: number;
}

export interface SearchResponse {
  chunks: DocumentChunk[];
  totalResults: number;
  processingTime: number;
  query: string;
}

// Document chunk interface
export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: {
    pageNumber: number;
    sectionTitle?: string;
    sectionType: string;
    startPosition: number;
    endPosition: number;
    confidence: number;
    similarity?: number;
    rank?: number;
  };
  createdAt: Date;
}

// Processing status
export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Error handling
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

// Utility type for API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}