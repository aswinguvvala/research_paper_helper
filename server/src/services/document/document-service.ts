import path from 'path';
import fs from 'fs/promises';
import { 
  DocumentMetadata, 
  DocumentChunk, 
  UploadDocumentRequest,
  UploadDocumentResponse,
  ProcessingStatus,
  SearchRequest,
  SearchResponse,
  ApiError,
  ErrorCode
} from '../../types';
import { createApiError, generateId } from '../../types';
import { databaseManager } from '../../database/connection';
import { pdfProcessor, DocumentStructure, ParsedDocument } from './pdf-processor';
import { vectorStore } from './vector-store';
import logger from '../../utils/logger';
import config, { env } from '../../config';
import crypto from 'crypto';

export interface DocumentProcessingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  preserveStructure?: boolean;
  extractMetadata?: boolean;
  generateEmbeddings?: boolean;
}

export class DocumentService {
  private readonly uploadDir: string;
  private processingJobs = new Map<string, ProcessingStatus>();

  constructor() {
    this.uploadDir = path.resolve(env.UPLOAD_DIR || './uploads');
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create upload directory', { error, dir: this.uploadDir });
    }
  }

  async uploadDocument(
    file: Express.Multer.File,
    options: DocumentProcessingOptions = {}
  ): Promise<UploadDocumentResponse> {
    const documentId = generateId();
    
    try {
      logger.info('Starting document upload', {
        documentId,
        filename: file.originalname,
        size: file.size
      });

      // Store file
      const filePath = path.join(this.uploadDir, `${documentId}.pdf`);
      await fs.writeFile(filePath, file.buffer);

      // Create initial document record
      const metadata = await this.createDocumentRecord(
        documentId,
        file.originalname,
        filePath,
        file.size
      );

      // Start processing in background
      this.processingJobs.set(documentId, ProcessingStatus.PROCESSING);
      this.processDocumentAsync(documentId, filePath, file.originalname, options)
        .catch(error => {
          logger.error('Background processing failed', { error, documentId });
          this.processingJobs.set(documentId, ProcessingStatus.FAILED);
        });

      return {
        document: metadata,
        processingStatus: ProcessingStatus.PROCESSING
      };

    } catch (error) {
      logger.error('Document upload failed', { error, documentId });
      await this.cleanup(documentId);
      throw createApiError(
        ErrorCode.PROCESSING_FAILED,
        'Failed to upload document',
        { originalError: error.message }
      );
    }
  }

  private async createDocumentRecord(
    documentId: string,
    filename: string,
    filePath: string,
    fileSize: number
  ): Promise<DocumentMetadata> {
    const metadata: DocumentMetadata = {
      id: documentId,
      filename,
      uploadedAt: new Date(),
      totalPages: 0, // Will be updated after processing
      totalChunks: 0,
      fileSize,
      mimeType: 'application/pdf'
    };

    const db = databaseManager.database;
    
    await db.run(`
      INSERT INTO documents (
        id, filename, title, authors, abstract,
        uploaded_at, processed_at, total_pages, total_chunks,
        file_size, mime_type, file_path, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      metadata.id,
      metadata.filename,
      null, // Will be updated after processing
      null,
      null,
      metadata.uploadedAt.toISOString(),
      null,
      metadata.totalPages,
      metadata.totalChunks,
      metadata.fileSize,
      metadata.mimeType,
      filePath,
      JSON.stringify({})
    ]);

    return metadata;
  }

  private async processDocumentAsync(
    documentId: string,
    filePath: string,
    filename: string,
    options: DocumentProcessingOptions
  ): Promise<void> {
    try {
      logger.info('Starting advanced document processing', { documentId, filename });

      // Step 1: Parse PDF and extract basic structure
      const parsed = await pdfProcessor.parsePDF(filePath);
      
      // Step 2: Analyze document structure with advanced NLP
      const documentStructure = await pdfProcessor.analyzeDocumentStructure(parsed);
      
      // Step 3: Generate document fingerprints for caching
      const contentHash = await pdfProcessor.generateDocumentFingerprint(filePath, parsed.text);
      const structureHash = await this.generateStructureHash(documentStructure);
      
      // Step 4: Check if reprocessing is needed
      const needsReprocessing = await vectorStore.checkDocumentNeedsReprocessing(
        documentId,
        contentHash,
        structureHash
      );

      let chunks: DocumentChunk[];
      
      if (needsReprocessing) {
        logger.info('Document needs reprocessing, creating new chunks', { documentId });
        
        // Create semantic chunks using the hierarchical structure
        chunks = await pdfProcessor.createSemanticChunks(
          documentId,
          documentStructure,
          {
            chunkSize: options.chunkSize || 1000,
            chunkOverlap: options.chunkOverlap || 200,
            preserveStructure: options.preserveStructure !== false,
            extractMetadata: options.extractMetadata !== false
          }
        );
      } else {
        logger.info('Document structure unchanged, using cached chunks', { documentId });
        // Could load from cache here, but for now, reprocess
        chunks = await pdfProcessor.createSemanticChunks(
          documentId,
          documentStructure,
          {
            chunkSize: options.chunkSize || 1000,
            chunkOverlap: options.chunkOverlap || 200,
            preserveStructure: options.preserveStructure !== false,
            extractMetadata: options.extractMetadata !== false
          }
        );
      }

      // Step 5: Create enhanced metadata from structure analysis
      const enhancedMetadata = this.createEnhancedMetadata(
        documentId,
        filename,
        documentStructure,
        parsed,
        chunks.length
      );

      // Step 6: Update document metadata in database
      await this.updateDocumentRecord(documentId, enhancedMetadata, chunks.length);
      
      // Step 7: Store document structure
      await this.storeDocumentStructure(documentId, documentStructure);

      // Step 8: Store chunks and generate embeddings with fingerprinting
      if (options.generateEmbeddings !== false) {
        await vectorStore.storeChunks(chunks);
        
        // Create document fingerprint for caching
        await vectorStore.createDocumentFingerprint(
          documentId,
          contentHash,
          structureHash
        );
        
        // Warm up vector cache for better performance
        await vectorStore.warmupVectorCache(documentId);
      } else {
        await this.storeChunksWithoutEmbeddings(chunks);
      }

      // Step 9: Mark as completed
      this.processingJobs.set(documentId, ProcessingStatus.COMPLETED);

      logger.info('Advanced document processing completed', {
        documentId,
        totalPages: enhancedMetadata.totalPages,
        totalChunks: chunks.length,
        sectionsFound: documentStructure.sections.length,
        citationsFound: documentStructure.citations.length,
        figuresFound: documentStructure.figures.length
      });

    } catch (error) {
      logger.error('Document processing failed', { error, documentId });
      this.processingJobs.set(documentId, ProcessingStatus.FAILED);
      
      // Update database to reflect failure
      const db = databaseManager.database;
      await db.run(
        'UPDATE documents SET processed_at = ?, metadata = ? WHERE id = ?',
        [
          new Date().toISOString(),
          JSON.stringify({ error: error.message, processingFailed: true }),
          documentId
        ]
      );
    }
  }

  private async updateDocumentRecord(
    documentId: string,
    metadata: DocumentMetadata,
    totalChunks: number
  ): Promise<void> {
    const db = databaseManager.database;
    
    await db.run(`
      UPDATE documents SET 
        title = ?, authors = ?, abstract = ?,
        processed_at = ?, total_pages = ?, total_chunks = ?,
        metadata = ?
      WHERE id = ?
    `, [
      metadata.title,
      metadata.authors ? JSON.stringify(metadata.authors) : null,
      metadata.abstract,
      new Date().toISOString(),
      metadata.totalPages,
      totalChunks,
      JSON.stringify({}),
      documentId
    ]);
  }

  private async storeChunksWithoutEmbeddings(chunks: DocumentChunk[]): Promise<void> {
    const db = databaseManager.database;
    
    await db.run('BEGIN TRANSACTION');
    
    try {
      for (const chunk of chunks) {
        await db.run(`
          INSERT INTO document_chunks (
            id, document_id, content, embedding,
            page_number, section_title, section_type,
            start_position, end_position, confidence, bounding_box,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          chunk.id,
          chunk.documentId,
          chunk.content,
          null, // No embedding
          chunk.metadata.pageNumber,
          chunk.metadata.sectionTitle,
          chunk.metadata.sectionType,
          chunk.metadata.startPosition,
          chunk.metadata.endPosition,
          chunk.metadata.confidence,
          JSON.stringify(chunk.metadata.boundingBox),
          chunk.createdAt.toISOString()
        ]);
      }
      
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  async getDocument(documentId: string): Promise<DocumentMetadata | null> {
    try {
      const db = databaseManager.database;
      
      const row = await db.get(`
        SELECT 
          id, filename, title, authors, abstract,
          uploaded_at, processed_at, total_pages, total_chunks,
          file_size, mime_type, metadata
        FROM documents 
        WHERE id = ?
      `, [documentId]);

      if (!row) return null;

      return {
        id: row.id,
        filename: row.filename,
        title: row.title,
        authors: row.authors ? JSON.parse(row.authors) : undefined,
        abstract: row.abstract,
        uploadedAt: new Date(row.uploaded_at),
        processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
        totalPages: row.total_pages,
        totalChunks: row.total_chunks,
        fileSize: row.file_size,
        mimeType: row.mime_type
      };

    } catch (error) {
      logger.error('Failed to get document', { error, documentId });
      throw createApiError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        { documentId }
      );
    }
  }

  async searchDocument(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      const {
        query,
        documentId,
        filters = {},
        limit = 10,
        similarityThreshold = 0.7
      } = request;

      // Check if document exists
      const document = await this.getDocument(documentId);
      if (!document) {
        throw createApiError(
          ErrorCode.DOCUMENT_NOT_FOUND,
          'Document not found',
          { documentId }
        );
      }

      // Perform vector search
      const searchOptions = {
        limit,
        similarityThreshold,
        sectionTypes: filters.sectionTypes,
        pageRange: filters.pageRange,
        includeContent: true
      };

      const vectorResults = await vectorStore.hybridSearch(
        query,
        documentId,
        searchOptions
      );

      // Convert to response format
      const chunks = vectorResults.map(result => ({
        ...result.chunk,
        // Add similarity score to metadata for client use
        metadata: {
          ...result.chunk.metadata,
          similarity: result.similarity,
          rank: result.rank
        }
      }));

      const processingTime = Date.now() - startTime;

      return {
        chunks,
        totalResults: vectorResults.length,
        processingTime,
        query
      };

    } catch (error) {
      logger.error('Document search failed', { error, request });
      throw error instanceof ApiError ? error : createApiError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Search failed',
        { originalError: error.message }
      );
    }
  }

  async getProcessingStatus(documentId: string): Promise<ProcessingStatus> {
    // Check in-memory job status first
    if (this.processingJobs.has(documentId)) {
      return this.processingJobs.get(documentId)!;
    }

    // Check database for completed status
    const document = await this.getDocument(documentId);
    if (!document) {
      throw createApiError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        { documentId }
      );
    }

    return document.processedAt ? ProcessingStatus.COMPLETED : ProcessingStatus.PENDING;
  }

  async listDocuments(page: number = 1, limit: number = 20): Promise<{
    documents: DocumentMetadata[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = databaseManager.database;
      const offset = (page - 1) * limit;

      // Get total count
      const countResult = await db.get('SELECT COUNT(*) as total FROM documents');
      const total = countResult.total || 0;

      // Get documents
      const rows = await db.all(`
        SELECT 
          id, filename, title, authors, abstract,
          uploaded_at, processed_at, total_pages, total_chunks,
          file_size, mime_type, metadata
        FROM documents 
        ORDER BY uploaded_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      const documents: DocumentMetadata[] = rows.map(row => ({
        id: row.id,
        filename: row.filename,
        title: row.title,
        authors: row.authors ? JSON.parse(row.authors) : undefined,
        abstract: row.abstract,
        uploadedAt: new Date(row.uploaded_at),
        processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
        totalPages: row.total_pages,
        totalChunks: row.total_chunks,
        fileSize: row.file_size,
        mimeType: row.mime_type
      }));

      return {
        documents,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };

    } catch (error) {
      logger.error('Failed to list documents', { error });
      throw createApiError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to list documents'
      );
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    try {
      const db = databaseManager.database;
      
      // Get document info for cleanup
      const document = await this.getDocument(documentId);
      if (!document) {
        throw createApiError(
          ErrorCode.DOCUMENT_NOT_FOUND,
          'Document not found'
        );
      }

      await db.run('BEGIN TRANSACTION');

      try {
        // Delete chunks first (foreign key constraint)
        await vectorStore.deleteDocumentChunks(documentId);
        
        // Delete document record
        await db.run('DELETE FROM documents WHERE id = ?', [documentId]);
        
        await db.run('COMMIT');

        // Clean up file
        await this.cleanup(documentId);
        
        // Remove from processing jobs
        this.processingJobs.delete(documentId);

        logger.info('Document deleted successfully', { documentId });

      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      logger.error('Failed to delete document', { error, documentId });
      throw error instanceof ApiError ? error : createApiError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to delete document'
      );
    }
  }

  async getDocumentStats(documentId: string) {
    const document = await this.getDocument(documentId);
    if (!document) {
      throw createApiError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found'
      );
    }

    const vectorStats = await vectorStore.getDocumentStats(documentId);
    
    return {
      document,
      ...vectorStats,
      processingStatus: await this.getProcessingStatus(documentId)
    };
  }

  private async cleanup(documentId: string): Promise<void> {
    try {
      const filePath = path.join(this.uploadDir, `${documentId}.pdf`);
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist, ignore error
      logger.warn('Failed to cleanup document file', { error, documentId });
    }
  }

  private async generateStructureHash(structure: DocumentStructure): Promise<string> {
    const structureString = JSON.stringify({
      sections: structure.sections.length,
      citations: structure.citations.length,
      figures: structure.figures.length,
      tables: structure.tables.length,
      equations: structure.equations.length,
      sectionTitles: structure.sections.map(s => s.title).join('|')
    });
    
    return crypto.createHash('md5').update(structureString).digest('hex');
  }

  private createEnhancedMetadata(
    documentId: string,
    filename: string,
    structure: DocumentStructure,
    parsed: ParsedDocument,
    totalChunks: number
  ): DocumentMetadata {
    return {
      id: documentId,
      filename,
      title: structure.title || parsed.info?.Title || null,
      authors: structure.authors.length > 0 ? structure.authors : undefined,
      abstract: structure.abstract,
      uploadedAt: new Date(),
      processedAt: new Date(),
      totalPages: parsed.numPages,
      totalChunks,
      fileSize: 0, // Will be set during upload
      mimeType: 'application/pdf'
    };
  }

  private async storeDocumentStructure(
    documentId: string,
    structure: DocumentStructure
  ): Promise<void> {
    const db = databaseManager.database;
    
    await db.run('BEGIN TRANSACTION');
    
    try {
      // Store hierarchical sections
      for (const section of structure.sections) {
        await this.storeSection(documentId, section);
      }
      
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  private async storeSection(
    documentId: string,
    section: any,
    parentId?: string
  ): Promise<void> {
    const db = databaseManager.database;
    
    await db.run(`
      INSERT INTO document_sections (
        id, document_id, parent_section_id, section_type, title, level,
        page_start, page_end, keywords, sentence_count, readability_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      section.id,
      documentId,
      parentId,
      section.type,
      section.title,
      section.level,
      section.pageStart,
      section.pageEnd,
      JSON.stringify(section.keywords || []),
      section.sentenceCount || 0,
      section.readabilityScore || 0
    ]);

    // Recursively store child sections
    for (const child of section.children || []) {
      await this.storeSection(documentId, child, section.id);
    }
  }

  // Advanced search with enhanced features
  async advancedSearchDocument(request: SearchRequest & {
    strategy?: 'semantic' | 'hybrid' | 'contextual';
    educationLevel?: string;
    boostFactors?: any;
  }): Promise<SearchResponse & {
    explanations?: string[];
    relatedSections?: any[];
  }> {
    const startTime = Date.now();
    
    try {
      const {
        query,
        documentId,
        filters = {},
        limit = 10,
        similarityThreshold = 0.7,
        strategy = 'hybrid',
        boostFactors
      } = request;

      // Check if document exists
      const document = await this.getDocument(documentId);
      if (!document) {
        throw createApiError(
          ErrorCode.DOCUMENT_NOT_FOUND,
          'Document not found',
          { documentId }
        );
      }

      // Perform advanced vector search
      const searchOptions = {
        strategy: strategy as any,
        limit,
        similarityThreshold,
        sectionTypes: filters.sectionTypes,
        pageRange: filters.pageRange,
        includeContent: true,
        boostFactors
      };

      const vectorResults = await vectorStore.advancedSearch(
        query,
        documentId,
        searchOptions
      );

      // Convert to response format with explanations
      const chunks = vectorResults.map(result => ({
        ...result.chunk,
        metadata: {
          ...result.chunk.metadata,
          similarity: result.similarity,
          rank: result.rank,
          relevanceScore: result.relevanceScore
        }
      }));

      const processingTime = Date.now() - startTime;

      return {
        chunks,
        totalResults: vectorResults.length,
        processingTime,
        query,
        explanations: vectorResults.flatMap(r => r.explanations || []),
        relatedSections: [] // Could be enhanced with section relationships
      };

    } catch (error) {
      logger.error('Advanced document search failed', { error, request });
      throw error instanceof ApiError ? error : createApiError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'Advanced search failed',
        { originalError: error.message }
      );
    }
  }

  // Get document structure for advanced features
  async getDocumentStructure(documentId: string): Promise<{
    sections: any[];
    citations: any[];
    figures: any[];
    tables: any[];
    stats: any;
  }> {
    const db = databaseManager.database;
    
    // Get hierarchical sections
    const sections = await db.all(`
      SELECT * FROM document_sections 
      WHERE document_id = ? 
      ORDER BY level, page_start
    `, [documentId]);

    // Get document stats
    const stats = await vectorStore.getDocumentStats(documentId);

    return {
      sections: this.buildSectionHierarchy(sections),
      citations: [], // Would be populated from document structure
      figures: [],
      tables: [],
      stats
    };
  }

  private buildSectionHierarchy(flatSections: any[]): any[] {
    const sectionMap = new Map();
    const rootSections: any[] = [];

    // First pass: create section objects
    flatSections.forEach(section => {
      sectionMap.set(section.id, {
        ...section,
        keywords: JSON.parse(section.keywords || '[]'),
        children: []
      });
    });

    // Second pass: build hierarchy
    flatSections.forEach(section => {
      const sectionObj = sectionMap.get(section.id);
      if (section.parent_section_id) {
        const parent = sectionMap.get(section.parent_section_id);
        if (parent) {
          parent.children.push(sectionObj);
        }
      } else {
        rootSections.push(sectionObj);
      }
    });

    return rootSections;
  }

  async healthCheck(): Promise<{
    status: string;
    documentsCount: number;
    chunksCount: number;
    processingJobs: number;
  }> {
    try {
      const db = databaseManager.database;
      
      const docCount = await db.get('SELECT COUNT(*) as count FROM documents');
      const chunkCount = await db.get('SELECT COUNT(*) as count FROM document_chunks');
      
      return {
        status: 'healthy',
        documentsCount: docCount.count || 0,
        chunksCount: chunkCount.count || 0,
        processingJobs: this.processingJobs.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        documentsCount: 0,
        chunksCount: 0,
        processingJobs: this.processingJobs.size
      };
    }
  }
}

export const documentService = new DocumentService();