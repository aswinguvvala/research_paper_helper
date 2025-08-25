import { EducationLevel, DocumentChunk, Citation, ApiError, ErrorCode } from './types';
import { VALIDATION_RULES, ERROR_MESSAGES } from './constants';

// Utility functions for type checking and validation
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Type guards
export function isValidEducationLevel(level: string): level is EducationLevel {
  return Object.values(EducationLevel).includes(level as EducationLevel);
}

export function isValidFileExtension(filename: string): boolean {
  const extension = getFileExtension(filename);
  return VALIDATION_RULES.FILENAME.ALLOWED_EXTENSIONS.includes(extension);
}

export function isValidSessionId(sessionId: string): boolean {
  return VALIDATION_RULES.SESSION_ID.PATTERN.test(sessionId);
}

export function isValidDocumentId(documentId: string): boolean {
  return VALIDATION_RULES.DOCUMENT_ID.PATTERN.test(documentId);
}

// String utilities
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/__+/g, '_')
    .toLowerCase();
}

export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : filename.slice(lastDotIndex);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Validation functions
export function validateFileUpload(file: File | { size: number; name: string }): void {
  if (!file.name || file.name.length < VALIDATION_RULES.FILENAME.MIN_LENGTH) {
    throw new ValidationError('Filename is too short', 'filename');
  }
  
  if (file.name.length > VALIDATION_RULES.FILENAME.MAX_LENGTH) {
    throw new ValidationError('Filename is too long', 'filename');
  }
  
  if (!isValidFileExtension(file.name)) {
    throw new ValidationError(ERROR_MESSAGES.INVALID_FILE_TYPE, 'file');
  }
  
  // Assuming DEFAULT_CONFIG.MAX_DOCUMENT_SIZE is available
  if (file.size > 50 * 1024 * 1024) { // 50MB
    throw new ValidationError(ERROR_MESSAGES.FILE_TOO_LARGE, 'file');
  }
}

export function validateMessage(message: string): void {
  if (!message || message.trim().length < VALIDATION_RULES.MESSAGE.MIN_LENGTH) {
    throw new ValidationError('Message cannot be empty', 'message');
  }
  
  if (message.length > VALIDATION_RULES.MESSAGE.MAX_LENGTH) {
    throw new ValidationError('Message is too long', 'message');
  }
}

export function validateEducationLevel(level: string): EducationLevel {
  if (!isValidEducationLevel(level)) {
    throw new ValidationError(ERROR_MESSAGES.INVALID_EDUCATION_LEVEL, 'educationLevel');
  }
  return level;
}

// Array utilities
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export function deduplicate<T>(array: T[], keyFn?: (item: T) => string): T[] {
  if (!keyFn) {
    return [...new Set(array)];
  }
  
  const seen = new Set<string>();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Vector and similarity utilities
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return norm === 0 ? vector : vector.map(val => val / norm);
}

// Ranking and scoring utilities
export function rankDocumentChunks(
  chunks: DocumentChunk[],
  queryEmbedding: number[],
  weights: { similarity: number; recency: number; section: number } = { similarity: 0.7, recency: 0.2, section: 0.1 }
): DocumentChunk[] {
  return chunks
    .map(chunk => {
      const similarity = chunk.embedding 
        ? cosineSimilarity(queryEmbedding, chunk.embedding)
        : 0;
      
      // Recency score (newer chunks score higher)
      const recency = Math.exp(-((Date.now() - chunk.createdAt.getTime()) / (1000 * 60 * 60 * 24))); // Decay over days
      
      // Section importance (from constants.ts)
      const sectionWeight = getSectionWeight(chunk.metadata.sectionType);
      
      const score = (similarity * weights.similarity) + 
                   (recency * weights.recency) + 
                   (sectionWeight * weights.section);
      
      return { ...chunk, score };
    })
    .sort((a, b) => (b as any).score - (a as any).score);
}

function getSectionWeight(sectionType: string): number {
  // This would normally import from constants.ts, simplified for now
  const weights: Record<string, number> = {
    title: 1.0,
    abstract: 0.9,
    introduction: 0.8,
    methodology: 0.9,
    results: 0.9,
    discussion: 0.8,
    conclusion: 0.8,
    references: 0.3,
    figure: 0.6,
    table: 0.7,
    equation: 0.8,
    other: 0.5
  };
  return weights[sectionType] || 0.5;
}

// Citation utilities
export function generateCitations(chunks: DocumentChunk[], confidenceThreshold: number = 0.7): Citation[] {
  return chunks
    .filter(chunk => chunk.metadata.confidence >= confidenceThreshold)
    .map(chunk => ({
      chunkId: chunk.id,
      pageNumber: chunk.metadata.pageNumber,
      confidence: chunk.metadata.confidence,
      relevanceScore: (chunk as any).score || 0
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Error handling utilities
export function createApiError(
  code: ErrorCode,
  message: string,
  details?: Record<string, any>,
  requestId?: string
): ApiError {
  return {
    code,
    message,
    details,
    timestamp: new Date(),
    requestId
  };
}

export function isApiError(error: any): error is ApiError {
  return error && typeof error === 'object' && 'code' in error && 'message' in error;
}

// Time and date utilities
export function formatTimestamp(date: Date, includeTime: boolean = true): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime && {
      hour: '2-digit',
      minute: '2-digit'
    })
  };
  return date.toLocaleDateString('en-US', options);
}

export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatTimestamp(date, false);
}

// Performance utilities
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Memory and performance monitoring
export function measureExecutionTime<T>(fn: () => T): { result: T; time: number } {
  const start = performance.now();
  const result = fn();
  const time = performance.now() - start;
  return { result, time };
}

export async function measureAsyncExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
  const start = performance.now();
  const result = await fn();
  const time = performance.now() - start;
  return { result, time };
}

// Development utilities
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function logger(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
  if (isProduction() && level === 'info') return;
  
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  
  if (data) {
    console[level](logMessage, data);
  } else {
    console[level](logMessage);
  }
}