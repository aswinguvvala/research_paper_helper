"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentService = exports.DocumentService = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const types_1 = require("../types");
const types_2 = require("../types");
const connection_1 = require("../../database/connection");
const pdf_processor_1 = require("./pdf-processor");
const vector_store_1 = require("./vector-store");
const logger_1 = __importDefault(require("../../utils/logger"));
const config_1 = require("../../config");
const crypto_1 = __importDefault(require("crypto"));
class DocumentService {
    constructor() {
        this.processingJobs = new Map();
        this.uploadDir = path_1.default.resolve(config_1.env.UPLOAD_DIR || './uploads');
        this.ensureUploadDir();
    }
    async ensureUploadDir() {
        try {
            await promises_1.default.mkdir(this.uploadDir, { recursive: true });
        }
        catch (error) {
            logger_1.default.error('Failed to create upload directory', { error, dir: this.uploadDir });
        }
    }
    async uploadDocument(file, options = {}) {
        const documentId = (0, types_2.generateId)();
        try {
            logger_1.default.info('Starting document upload', {
                documentId,
                filename: file.originalname,
                size: file.size
            });
            // Store file
            const filePath = path_1.default.join(this.uploadDir, `${documentId}.pdf`);
            await promises_1.default.writeFile(filePath, file.buffer);
            // Create initial document record
            const metadata = await this.createDocumentRecord(documentId, file.originalname, filePath, file.size);
            // Start processing in background
            this.processingJobs.set(documentId, types_1.ProcessingStatus.PROCESSING);
            this.processDocumentAsync(documentId, filePath, file.originalname, options)
                .catch(error => {
                logger_1.default.error('Background processing failed', { error, documentId });
                this.processingJobs.set(documentId, types_1.ProcessingStatus.FAILED);
            });
            return {
                document: metadata,
                processingStatus: types_1.ProcessingStatus.PROCESSING
            };
        }
        catch (error) {
            logger_1.default.error('Document upload failed', { error, documentId });
            await this.cleanup(documentId);
            throw (0, types_2.createApiError)(types_1.ErrorCode.PROCESSING_FAILED, 'Failed to upload document', { originalError: error.message });
        }
    }
    async createDocumentRecord(documentId, filename, filePath, fileSize) {
        const metadata = {
            id: documentId,
            filename,
            uploadedAt: new Date(),
            totalPages: 0, // Will be updated after processing
            totalChunks: 0,
            fileSize,
            mimeType: 'application/pdf'
        };
        const db = connection_1.databaseManager.database;
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
    async processDocumentAsync(documentId, filePath, filename, options) {
        try {
            logger_1.default.info('Starting advanced document processing', { documentId, filename });
            // Step 1: Parse PDF and extract basic structure
            const parsed = await pdf_processor_1.pdfProcessor.parsePDF(filePath);
            // Step 2: Analyze document structure with advanced NLP
            const documentStructure = await pdf_processor_1.pdfProcessor.analyzeDocumentStructure(parsed);
            // Step 3: Generate document fingerprints for caching
            const contentHash = await pdf_processor_1.pdfProcessor.generateDocumentFingerprint(filePath, parsed.text);
            const structureHash = await this.generateStructureHash(documentStructure);
            // Step 4: Check if reprocessing is needed
            const needsReprocessing = await vector_store_1.vectorStore.checkDocumentNeedsReprocessing(documentId, contentHash, structureHash);
            let chunks;
            if (needsReprocessing) {
                logger_1.default.info('Document needs reprocessing, creating new chunks', { documentId });
                // Create semantic chunks using the hierarchical structure
                chunks = await pdf_processor_1.pdfProcessor.createSemanticChunks(documentId, documentStructure, {
                    chunkSize: options.chunkSize || 1000,
                    chunkOverlap: options.chunkOverlap || 200,
                    preserveStructure: options.preserveStructure !== false,
                    extractMetadata: options.extractMetadata !== false
                });
            }
            else {
                logger_1.default.info('Document structure unchanged, using cached chunks', { documentId });
                // Could load from cache here, but for now, reprocess
                chunks = await pdf_processor_1.pdfProcessor.createSemanticChunks(documentId, documentStructure, {
                    chunkSize: options.chunkSize || 1000,
                    chunkOverlap: options.chunkOverlap || 200,
                    preserveStructure: options.preserveStructure !== false,
                    extractMetadata: options.extractMetadata !== false
                });
            }
            // Step 5: Create enhanced metadata from structure analysis
            const enhancedMetadata = this.createEnhancedMetadata(documentId, filename, documentStructure, parsed, chunks.length);
            // Step 6: Update document metadata in database
            await this.updateDocumentRecord(documentId, enhancedMetadata, chunks.length);
            // Step 7: Store document structure
            await this.storeDocumentStructure(documentId, documentStructure);
            // Step 8: Store chunks and generate embeddings with fingerprinting
            if (options.generateEmbeddings !== false) {
                await vector_store_1.vectorStore.storeChunks(chunks);
                // Create document fingerprint for caching
                await vector_store_1.vectorStore.createDocumentFingerprint(documentId, contentHash, structureHash);
                // Warm up vector cache for better performance
                await vector_store_1.vectorStore.warmupVectorCache(documentId);
            }
            else {
                await this.storeChunksWithoutEmbeddings(chunks);
            }
            // Step 9: Mark as completed
            this.processingJobs.set(documentId, types_1.ProcessingStatus.COMPLETED);
            logger_1.default.info('Advanced document processing completed', {
                documentId,
                totalPages: enhancedMetadata.totalPages,
                totalChunks: chunks.length,
                sectionsFound: documentStructure.sections.length,
                citationsFound: documentStructure.citations.length,
                figuresFound: documentStructure.figures.length
            });
        }
        catch (error) {
            logger_1.default.error('Document processing failed', { error, documentId });
            this.processingJobs.set(documentId, types_1.ProcessingStatus.FAILED);
            // Update database to reflect failure
            const db = connection_1.databaseManager.database;
            await db.run('UPDATE documents SET processed_at = ?, metadata = ? WHERE id = ?', [
                new Date().toISOString(),
                JSON.stringify({ error: error.message, processingFailed: true }),
                documentId
            ]);
        }
    }
    async updateDocumentRecord(documentId, metadata, totalChunks) {
        const db = connection_1.databaseManager.database;
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
    async storeChunksWithoutEmbeddings(chunks) {
        const db = connection_1.databaseManager.database;
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
        }
        catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }
    async getDocument(documentId) {
        try {
            const db = connection_1.databaseManager.database;
            const row = await db.get(`
        SELECT 
          id, filename, title, authors, abstract,
          uploaded_at, processed_at, total_pages, total_chunks,
          file_size, mime_type, metadata
        FROM documents 
        WHERE id = ?
      `, [documentId]);
            if (!row)
                return null;
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
        }
        catch (error) {
            logger_1.default.error('Failed to get document', { error, documentId });
            throw (0, types_2.createApiError)(types_1.ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found', { documentId });
        }
    }
    async searchDocument(request) {
        const startTime = Date.now();
        try {
            const { query, documentId, filters = {}, limit = 10, similarityThreshold = 0.7 } = request;
            // Check if document exists
            const document = await this.getDocument(documentId);
            if (!document) {
                throw (0, types_2.createApiError)(types_1.ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found', { documentId });
            }
            // Perform vector search
            const searchOptions = {
                limit,
                similarityThreshold,
                sectionTypes: filters.sectionTypes,
                pageRange: filters.pageRange,
                includeContent: true
            };
            const vectorResults = await vector_store_1.vectorStore.hybridSearch(query, documentId, searchOptions);
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
        }
        catch (error) {
            logger_1.default.error('Document search failed', { error, request });
            throw error instanceof types_1.ApiError ? error : (0, types_2.createApiError)(types_1.ErrorCode.INTERNAL_SERVER_ERROR, 'Search failed', { originalError: error.message });
        }
    }
    async getProcessingStatus(documentId) {
        // Check in-memory job status first
        if (this.processingJobs.has(documentId)) {
            return this.processingJobs.get(documentId);
        }
        // Check database for completed status
        const document = await this.getDocument(documentId);
        if (!document) {
            throw (0, types_2.createApiError)(types_1.ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found', { documentId });
        }
        return document.processedAt ? types_1.ProcessingStatus.COMPLETED : types_1.ProcessingStatus.PENDING;
    }
    async listDocuments(page = 1, limit = 20) {
        try {
            const db = connection_1.databaseManager.database;
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
            const documents = rows.map(row => ({
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
        }
        catch (error) {
            logger_1.default.error('Failed to list documents', { error });
            throw (0, types_2.createApiError)(types_1.ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to list documents');
        }
    }
    async deleteDocument(documentId) {
        try {
            const db = connection_1.databaseManager.database;
            // Get document info for cleanup
            const document = await this.getDocument(documentId);
            if (!document) {
                throw (0, types_2.createApiError)(types_1.ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found');
            }
            await db.run('BEGIN TRANSACTION');
            try {
                // Delete chunks first (foreign key constraint)
                await vector_store_1.vectorStore.deleteDocumentChunks(documentId);
                // Delete document record
                await db.run('DELETE FROM documents WHERE id = ?', [documentId]);
                await db.run('COMMIT');
                // Clean up file
                await this.cleanup(documentId);
                // Remove from processing jobs
                this.processingJobs.delete(documentId);
                logger_1.default.info('Document deleted successfully', { documentId });
            }
            catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        }
        catch (error) {
            logger_1.default.error('Failed to delete document', { error, documentId });
            throw error instanceof types_1.ApiError ? error : (0, types_2.createApiError)(types_1.ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to delete document');
        }
    }
    async getDocumentStats(documentId) {
        const document = await this.getDocument(documentId);
        if (!document) {
            throw (0, types_2.createApiError)(types_1.ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found');
        }
        const vectorStats = await vector_store_1.vectorStore.getDocumentStats(documentId);
        return {
            document,
            ...vectorStats,
            processingStatus: await this.getProcessingStatus(documentId)
        };
    }
    async cleanup(documentId) {
        try {
            const filePath = path_1.default.join(this.uploadDir, `${documentId}.pdf`);
            await promises_1.default.unlink(filePath);
        }
        catch (error) {
            // File might not exist, ignore error
            logger_1.default.warn('Failed to cleanup document file', { error, documentId });
        }
    }
    async generateStructureHash(structure) {
        const structureString = JSON.stringify({
            sections: structure.sections.length,
            citations: structure.citations.length,
            figures: structure.figures.length,
            tables: structure.tables.length,
            equations: structure.equations.length,
            sectionTitles: structure.sections.map(s => s.title).join('|')
        });
        return crypto_1.default.createHash('md5').update(structureString).digest('hex');
    }
    createEnhancedMetadata(documentId, filename, structure, parsed, totalChunks) {
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
    async storeDocumentStructure(documentId, structure) {
        const db = connection_1.databaseManager.database;
        await db.run('BEGIN TRANSACTION');
        try {
            // Store hierarchical sections
            for (const section of structure.sections) {
                await this.storeSection(documentId, section);
            }
            await db.run('COMMIT');
        }
        catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }
    async storeSection(documentId, section, parentId) {
        const db = connection_1.databaseManager.database;
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
    async advancedSearchDocument(request) {
        const startTime = Date.now();
        try {
            const { query, documentId, filters = {}, limit = 10, similarityThreshold = 0.7, strategy = 'hybrid', boostFactors } = request;
            // Check if document exists
            const document = await this.getDocument(documentId);
            if (!document) {
                throw (0, types_2.createApiError)(types_1.ErrorCode.DOCUMENT_NOT_FOUND, 'Document not found', { documentId });
            }
            // Perform advanced vector search
            const searchOptions = {
                strategy: strategy,
                limit,
                similarityThreshold,
                sectionTypes: filters.sectionTypes,
                pageRange: filters.pageRange,
                includeContent: true,
                boostFactors
            };
            const vectorResults = await vector_store_1.vectorStore.advancedSearch(query, documentId, searchOptions);
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
        }
        catch (error) {
            logger_1.default.error('Advanced document search failed', { error, request });
            throw error instanceof types_1.ApiError ? error : (0, types_2.createApiError)(types_1.ErrorCode.INTERNAL_SERVER_ERROR, 'Advanced search failed', { originalError: error.message });
        }
    }
    // Get document structure for advanced features
    async getDocumentStructure(documentId) {
        const db = connection_1.databaseManager.database;
        // Get hierarchical sections
        const sections = await db.all(`
      SELECT * FROM document_sections 
      WHERE document_id = ? 
      ORDER BY level, page_start
    `, [documentId]);
        // Get document stats
        const stats = await vector_store_1.vectorStore.getDocumentStats(documentId);
        return {
            sections: this.buildSectionHierarchy(sections),
            citations: [], // Would be populated from document structure
            figures: [],
            tables: [],
            stats
        };
    }
    buildSectionHierarchy(flatSections) {
        const sectionMap = new Map();
        const rootSections = [];
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
            }
            else {
                rootSections.push(sectionObj);
            }
        });
        return rootSections;
    }
    async healthCheck() {
        try {
            const db = connection_1.databaseManager.database;
            const docCount = await db.get('SELECT COUNT(*) as count FROM documents');
            const chunkCount = await db.get('SELECT COUNT(*) as count FROM document_chunks');
            return {
                status: 'healthy',
                documentsCount: docCount.count || 0,
                chunksCount: chunkCount.count || 0,
                processingJobs: this.processingJobs.size
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                documentsCount: 0,
                chunksCount: 0,
                processingJobs: this.processingJobs.size
            };
        }
    }
}
exports.DocumentService = DocumentService;
exports.documentService = new DocumentService();
