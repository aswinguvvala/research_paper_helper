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
  FIGURE = 'figure',
  TABLE = 'table',
  EQUATION = 'equation',
  OTHER = 'other'
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Chat and conversation types
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

export interface MessageMetadata {
  educationLevel?: EducationLevel;
  highlightedText?: HighlightedContent;
  citations?: Citation[];
  relatedChunks?: string[]; // Chunk IDs
  confidence?: number;
  tokens?: number;
}

export interface HighlightedContent {
  text: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  context?: string; // Surrounding text for better understanding
}

export interface Citation {
  chunkId: string;
  pageNumber: number;
  confidence: number;
  relevanceScore: number;
}

// Conversation and session management
export interface ConversationSession {
  id: string;
  documentId: string;
  userId?: string;
  educationLevel: EducationLevel;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  totalMessages: number;
  totalTokens: number;
  averageResponseTime: number;
  topics: string[];
  highlights: HighlightedContent[];
}

// API request/response types
export interface UploadDocumentRequest {
  file: File | Buffer;
  filename: string;
  educationLevel: EducationLevel;
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

export interface ChatRequest {
  sessionId: string;
  message: string;
  educationLevel: EducationLevel;
  highlightedText?: HighlightedContent;
  context?: string[];
}

export interface ChatResponse {
  message: ChatMessage;
  citations: Citation[];
  suggestedQuestions?: string[];
  processingTime: number;
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
  pageRange?: [number, number];
  educationLevel?: EducationLevel;
}

export interface SearchResponse {
  chunks: DocumentChunk[];
  totalResults: number;
  processingTime: number;
  query: string;
}

// AI service types
export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  processingTime: number;
  totalTokens: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: Date;
  services: ServiceStatus[];
  version: string;
}

export interface ServiceStatus {
  name: string;
  status: 'up' | 'down';
  responseTime?: number;
  lastCheck: Date;
  details?: Record<string, any>;
}

// Error handling types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  requestId?: string;
}

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}

// Configuration and settings types
export interface AppConfig {
  server: ServerConfig;
  ai: AIConfig;
  database: DatabaseConfig;
  features: FeatureFlags;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface AIConfig {
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  embeddings: {
    serviceUrl: string;
    model: string;
    dimensions: number;
    batchSize: number;
  };
  langchain: {
    temperature: number;
    maxTokens: number;
    topP: number;
  };
}

export interface DatabaseConfig {
  type: 'sqlite' | 'postgresql';
  url: string;
  pool?: {
    min: number;
    max: number;
  };
}

export interface FeatureFlags {
  enableAdvancedWorkflows: boolean;
  enableCaching: boolean;
  enableMetrics: boolean;
  maxDocumentSize: number;
  maxConcurrentSessions: number;
}

// Utility types
export type Awaited<T> = T extends PromiseLike<infer U> ? U : T;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface TimestampedEntity {
  createdAt: Date;
  updatedAt: Date;
}