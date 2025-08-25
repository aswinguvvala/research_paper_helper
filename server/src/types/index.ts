// Education levels supported by the application
export enum EducationLevel {
  HIGH_SCHOOL = 'high_school',
  UNDERGRADUATE = 'undergraduate', 
  MASTERS = 'masters',
  PHD = 'phd',
  NO_TECHNICAL = 'no_technical'
}

// Document processing and storage types
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

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
  metadata: ChunkMetadata;
  createdAt: Date;
}

export interface ChunkMetadata {
  pageNumber: number;
  sectionTitle?: string;
  sectionType: SectionType;
  startPosition: number;
  endPosition: number;
  boundingBox?: BoundingBox;
  confidence: number;
}

export enum SectionType {
  TITLE = 'title',
  ABSTRACT = 'abstract',
  INTRODUCTION = 'introduction',
  METHODOLOGY = 'methodology',
  RESULTS = 'results',
  DISCUSSION = 'discussion',
  CONCLUSION = 'conclusion',
  REFERENCES = 'references',
  APPENDIX = 'appendix',
  FIGURE = 'figure',
  TABLE = 'table',
  CAPTION = 'caption',
  OTHER = 'other'
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// API Request/Response types
export interface UploadDocumentRequest {
  chunkSize?: number;
  chunkOverlap?: number;
  preserveStructure?: boolean;
  extractMetadata?: boolean;
}

export interface UploadDocumentResponse {
  document: DocumentMetadata;
  processingStatus: ProcessingStatus;
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface SearchRequest {
  query: string;
  documentId: string;
  filters?: SearchFilters;
  limit?: number;
  similarityThreshold?: number;
}

export interface SearchFilters {
  sectionTypes?: SectionType[];
  pageRange?: {
    start: number;
    end: number;
  };
  dateRange?: {
    from: Date;
    to: Date;
  };
}

export interface SearchResponse {
  chunks: DocumentChunk[];
  totalResults: number;
  processingTime: number;
  query: string;
}

// Chat and conversation types
export interface ChatRequest {
  documentId: string;
  sessionId: string;
  message: string;
  educationLevel: EducationLevel;
  highlightedText?: HighlightedContent;
  context?: DocumentChunk[];
}

export interface ChatResponse {
  sessionId: string;
  response: string;
  sources: DocumentChunk[];
  educationLevel: EducationLevel;
  processingTime: number;
  timestamp: Date;
}

export interface HighlightedContent {
  text: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  context: string;
}

// Error handling
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED = 'UNAUTHORIZED'
}

export interface ApiError extends Error {
  code: ErrorCode;
  details?: any;
}

// Utility function to create API errors
export function createApiError(code: ErrorCode, message: string, details?: any): ApiError {
  const error = new Error(message) as ApiError;
  error.code = code;
  error.details = details;
  return error;
}

// Utility function to generate unique IDs
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Additional types for services
export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  ai: {
    embeddings: {
      serviceUrl: string;
    };
  };
}

export interface EmbeddingRequest {
  texts: string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  sessionId: string;
}

export interface ConversationSession {
  id: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  messageCount: number;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  educationLevel?: EducationLevel;
  documentId?: string;
  userId?: string;
}

export interface Citation {
  text: string;
  chunkId: string;
  pageNumber: number;
  confidence: number;
}

// Utility functions
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}