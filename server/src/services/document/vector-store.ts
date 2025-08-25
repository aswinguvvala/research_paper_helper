import crypto from 'crypto';
import { Database } from 'sqlite';
import { 
  DocumentChunk, 
  SearchRequest, 
  SearchResponse,
  SectionType 
} from '../../types';
import { cosineSimilarity } from '../../types';
import { databaseManager } from '../../database/connection';
import { aiService } from '../ai-service';
import logger from '../../utils/logger';

export interface VectorSearchResult {
  chunk: DocumentChunk;
  similarity: number;
  rank: number;
  relevanceScore?: number;
  explanations?: string[];
}

export interface SearchOptions {
  limit?: number;
  similarityThreshold?: number;
  sectionTypes?: SectionType[];
  pageRange?: [number, number];
  includeContent?: boolean;
  strategy?: SearchStrategy;
  boostFactors?: BoostFactors;
}

export enum SearchStrategy {
  SEMANTIC_ONLY = 'semantic_only',
  TEXT_ONLY = 'text_only',
  HYBRID = 'hybrid',
  CONTEXTUAL = 'contextual'
}

export interface BoostFactors {
  sectionType: Record<SectionType, number>;
  recency: number;
  readability: number;
  keywordMatch: number;
}

export interface EmbeddingVersion {
  version: string;
  model: string;
  dimensions: number;
  createdAt: Date;
  fingerprint: string;
}

export interface DocumentFingerprint {
  documentId: string;
  contentHash: string;
  structureHash: string;
  embeddingVersion: string;
  lastProcessed: Date;
  chunkCount: number;
}

export class VectorStore {
  private db: Database;
  private embeddingCache = new Map<string, number[]>();
  private documentFingerprints = new Map<string, DocumentFingerprint>();
  private currentEmbeddingVersion: EmbeddingVersion;

  constructor() {
    this.db = databaseManager.database;
    this.initializeEmbeddingVersion();
  }

  private async initializeEmbeddingVersion(): Promise<void> {
    this.currentEmbeddingVersion = {
      version: '1.0.0',
      model: 'all-MiniLM-L6-v2',
      dimensions: 384,
      createdAt: new Date(),
      fingerprint: this.generateVersionFingerprint()
    };
  }

  private generateVersionFingerprint(): string {
    const versionString = `${this.currentEmbeddingVersion?.model || 'all-MiniLM-L6-v2'}_${Date.now()}`;
    return crypto.createHash('sha256').update(versionString).digest('hex').substring(0, 16);
  }

  async storeChunks(chunks: DocumentChunk[]): Promise<void> {
    try {
      logger.info('Storing chunks in vector database', { count: chunks.length });
      
      // Generate embeddings in batches
      const texts = chunks.map(chunk => chunk.content);
      const embeddings = await aiService.generateEmbeddingsBatch(texts);
      
      // Store chunks with embeddings in database
      await this.db.run('BEGIN TRANSACTION');
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        
        await this.insertChunk(chunk, embedding);
        
        // Cache embedding for future use
        this.cacheEmbedding(chunk.content, embedding);
      }
      
      await this.db.run('COMMIT');
      
      logger.info('Successfully stored chunks', { count: chunks.length });
      
    } catch (error) {
      await this.db.run('ROLLBACK');
      logger.error('Failed to store chunks', { error, count: chunks.length });
      throw error;
    }
  }

  private async insertChunk(chunk: DocumentChunk, embedding: number[]): Promise<void> {
    const embeddingBlob = this.serializeEmbedding(embedding);
    
    await this.db.run(
      `INSERT INTO document_chunks (
        id, document_id, content, embedding,
        page_number, section_title, section_type,
        start_position, end_position, confidence, bounding_box,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chunk.id,
        chunk.documentId,
        chunk.content,
        embeddingBlob,
        chunk.metadata.pageNumber,
        chunk.metadata.sectionTitle,
        chunk.metadata.sectionType,
        chunk.metadata.startPosition,
        chunk.metadata.endPosition,
        chunk.metadata.confidence,
        JSON.stringify(chunk.metadata.boundingBox),
        chunk.createdAt.toISOString()
      ]
    );
  }

  async searchSimilar(
    query: string,
    documentId: string,
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    try {
      const {
        limit = 10,
        similarityThreshold = 0.7,
        sectionTypes,
        pageRange,
        includeContent = true
      } = options;

      logger.info('Performing vector search', { 
        query: query.substring(0, 100), 
        documentId,
        options 
      });

      // Generate query embedding
      const queryEmbedding = await this.getEmbedding(query);
      
      // Retrieve chunks from database
      const chunks = await this.retrieveChunks(documentId, {
        sectionTypes,
        pageRange,
        includeContent
      });
      
      if (chunks.length === 0) {
        return [];
      }

      // Compute similarities
      const results: VectorSearchResult[] = [];
      
      for (const chunk of chunks) {
        if (!chunk.embedding) continue;
        
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        
        if (similarity >= similarityThreshold) {
          results.push({
            chunk,
            similarity,
            rank: 0 // Will be set after sorting
          });
        }
      }

      // Sort by similarity and set ranks
      results.sort((a, b) => b.similarity - a.similarity);
      results.forEach((result, index) => {
        result.rank = index + 1;
      });

      // Apply limit
      const limitedResults = results.slice(0, limit);
      
      logger.info('Vector search completed', {
        totalChunks: chunks.length,
        matchingChunks: results.length,
        returnedChunks: limitedResults.length
      });

      return limitedResults;
      
    } catch (error) {
      logger.error('Vector search failed', { error, query, documentId });
      throw error;
    }
  }

  private async retrieveChunks(
    documentId: string,
    options: {
      sectionTypes?: SectionType[];
      pageRange?: [number, number];
      includeContent?: boolean;
    }
  ): Promise<DocumentChunk[]> {
    let query = `
      SELECT 
        id, document_id, content, embedding,
        page_number, section_title, section_type,
        start_position, end_position, confidence, bounding_box,
        created_at
      FROM document_chunks 
      WHERE document_id = ?
    `;
    
    const params: any[] = [documentId];
    
    // Add section type filter
    if (options.sectionTypes && options.sectionTypes.length > 0) {
      const placeholders = options.sectionTypes.map(() => '?').join(',');
      query += ` AND section_type IN (${placeholders})`;
      params.push(...options.sectionTypes);
    }
    
    // Add page range filter
    if (options.pageRange) {
      query += ` AND page_number BETWEEN ? AND ?`;
      params.push(options.pageRange[0], options.pageRange[1]);
    }
    
    query += ` ORDER BY page_number, start_position`;
    
    const rows = await this.db.all(query, params);
    
    return rows.map(row => this.deserializeChunk(row));
  }

  private deserializeChunk(row: any): DocumentChunk {
    return {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      embedding: row.embedding ? this.deserializeEmbedding(row.embedding) : undefined,
      metadata: {
        pageNumber: row.page_number,
        sectionTitle: row.section_title,
        sectionType: row.section_type,
        startPosition: row.start_position,
        endPosition: row.end_position,
        confidence: row.confidence,
        boundingBox: row.bounding_box ? JSON.parse(row.bounding_box) : undefined
      },
      createdAt: new Date(row.created_at)
    };
  }

  async hybridSearch(
    query: string,
    documentId: string,
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    try {
      // Combine vector similarity with text matching
      const vectorResults = await this.searchSimilar(query, documentId, options);
      const textResults = await this.searchText(query, documentId, options);
      
      // Merge and re-rank results
      const combinedResults = this.mergeSearchResults(vectorResults, textResults);
      
      return combinedResults.slice(0, options.limit || 10);
      
    } catch (error) {
      logger.error('Hybrid search failed', { error, query, documentId });
      throw error;
    }
  }

  private async searchText(
    query: string,
    documentId: string,
    options: SearchOptions
  ): Promise<VectorSearchResult[]> {
    // Simple text-based search using FTS (Full Text Search)
    // In production, you might use more sophisticated text search
    
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    if (queryTerms.length === 0) return [];
    
    let searchQuery = `
      SELECT 
        id, document_id, content, embedding,
        page_number, section_title, section_type,
        start_position, end_position, confidence, bounding_box,
        created_at
      FROM document_chunks 
      WHERE document_id = ?
    `;
    
    const params: any[] = [documentId];
    
    // Add text search conditions
    const textConditions = queryTerms.map(() => 'LOWER(content) LIKE ?').join(' OR ');
    searchQuery += ` AND (${textConditions})`;
    params.push(...queryTerms.map(term => `%${term}%`));
    
    // Add other filters
    if (options.sectionTypes && options.sectionTypes.length > 0) {
      const placeholders = options.sectionTypes.map(() => '?').join(',');
      searchQuery += ` AND section_type IN (${placeholders})`;
      params.push(...options.sectionTypes);
    }
    
    if (options.pageRange) {
      searchQuery += ` AND page_number BETWEEN ? AND ?`;
      params.push(options.pageRange[0], options.pageRange[1]);
    }
    
    const rows = await this.db.all(searchQuery, params);
    const chunks = rows.map(row => this.deserializeChunk(row));
    
    // Score based on text matching
    return chunks.map((chunk, index) => ({
      chunk,
      similarity: this.calculateTextSimilarity(query, chunk.content),
      rank: index + 1
    }));
  }

  private calculateTextSimilarity(query: string, content: string): number {
    // Simple text similarity based on term overlap
    const queryTerms = new Set(query.toLowerCase().split(/\s+/));
    const contentTerms = new Set(content.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...queryTerms].filter(term => contentTerms.has(term)));
    const union = new Set([...queryTerms, ...contentTerms]);
    
    return intersection.size / union.size;
  }

  private mergeSearchResults(
    vectorResults: VectorSearchResult[],
    textResults: VectorSearchResult[]
  ): VectorSearchResult[] {
    const merged = new Map<string, VectorSearchResult>();
    
    // Add vector results
    vectorResults.forEach(result => {
      merged.set(result.chunk.id, {
        ...result,
        similarity: result.similarity * 0.7 // Weight vector similarity
      });
    });
    
    // Merge text results
    textResults.forEach(textResult => {
      const existing = merged.get(textResult.chunk.id);
      if (existing) {
        // Combine scores
        existing.similarity = existing.similarity + (textResult.similarity * 0.3);
      } else {
        merged.set(textResult.chunk.id, {
          ...textResult,
          similarity: textResult.similarity * 0.3 // Weight text similarity
        });
      }
    });
    
    // Sort by combined score
    return Array.from(merged.values())
      .sort((a, b) => b.similarity - a.similarity)
      .map((result, index) => ({ ...result, rank: index + 1 }));
  }

  private async getEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.getCacheKey(text);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Check database cache
    const cached = await this.getCachedEmbedding(text);
    if (cached) {
      this.embeddingCache.set(cacheKey, cached);
      return cached;
    }

    // Generate new embedding
    const response = await aiService.generateEmbeddings({
      texts: [text],
      normalize: true
    });

    const embedding = response.embeddings[0];
    
    // Cache for future use
    this.cacheEmbedding(text, embedding);
    await this.storeCachedEmbedding(text, embedding);
    
    return embedding;
  }

  private async getCachedEmbedding(text: string): Promise<number[] | null> {
    const hash = this.getCacheKey(text);
    
    const row = await this.db.get(
      'SELECT embedding FROM embedding_cache WHERE text_hash = ?',
      [hash]
    );
    
    return row ? this.deserializeEmbedding(row.embedding) : null;
  }

  private async storeCachedEmbedding(text: string, embedding: number[]): Promise<void> {
    const hash = this.getCacheKey(text);
    const embeddingBlob = this.serializeEmbedding(embedding);
    
    await this.db.run(
      `INSERT OR REPLACE INTO embedding_cache 
       (text_hash, embedding, model_name, created_at) 
       VALUES (?, ?, ?, ?)`,
      [hash, embeddingBlob, 'all-MiniLM-L6-v2', new Date().toISOString()]
    );
  }

  private getCacheKey(text: string): string {
    return crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex');
  }

  private cacheEmbedding(text: string, embedding: number[]): void {
    const key = this.getCacheKey(text);
    this.embeddingCache.set(key, embedding);
    
    // Limit cache size to prevent memory issues
    if (this.embeddingCache.size > 1000) {
      const firstKey = this.embeddingCache.keys().next().value;
      this.embeddingCache.delete(firstKey);
    }
  }

  private serializeEmbedding(embedding: number[]): Buffer {
    // Convert float array to binary format for efficient storage
    const buffer = Buffer.allocUnsafe(embedding.length * 4);
    embedding.forEach((value, index) => {
      buffer.writeFloatLE(value, index * 4);
    });
    return buffer;
  }

  private deserializeEmbedding(buffer: Buffer): number[] {
    // Convert binary format back to float array
    const embedding: number[] = [];
    for (let i = 0; i < buffer.length; i += 4) {
      embedding.push(buffer.readFloatLE(i));
    }
    return embedding;
  }

  async getDocumentStats(documentId: string): Promise<{
    totalChunks: number;
    averageChunkSize: number;
    sectionDistribution: Record<string, number>;
    pageDistribution: Record<number, number>;
  }> {
    const stats = await this.db.get(`
      SELECT 
        COUNT(*) as totalChunks,
        AVG(LENGTH(content)) as averageChunkSize
      FROM document_chunks 
      WHERE document_id = ?
    `, [documentId]);

    const sectionStats = await this.db.all(`
      SELECT section_type, COUNT(*) as count
      FROM document_chunks 
      WHERE document_id = ?
      GROUP BY section_type
    `, [documentId]);

    const pageStats = await this.db.all(`
      SELECT page_number, COUNT(*) as count
      FROM document_chunks 
      WHERE document_id = ?
      GROUP BY page_number
      ORDER BY page_number
    `, [documentId]);

    return {
      totalChunks: stats.totalChunks || 0,
      averageChunkSize: Math.round(stats.averageChunkSize || 0),
      sectionDistribution: Object.fromEntries(
        sectionStats.map(s => [s.section_type, s.count])
      ),
      pageDistribution: Object.fromEntries(
        pageStats.map(s => [s.page_number, s.count])
      )
    };
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    await this.db.run(
      'DELETE FROM document_chunks WHERE document_id = ?',
      [documentId]
    );
    
    logger.info('Deleted document chunks', { documentId });
  }

  clearEmbeddingCache(): void {
    this.embeddingCache.clear();
  }

  // Advanced Document Fingerprinting
  async createDocumentFingerprint(
    documentId: string,
    contentHash: string,
    structureHash: string
  ): Promise<DocumentFingerprint> {
    const fingerprint: DocumentFingerprint = {
      documentId,
      contentHash,
      structureHash,
      embeddingVersion: this.currentEmbeddingVersion.fingerprint,
      lastProcessed: new Date(),
      chunkCount: 0
    };

    // Store fingerprint in database
    await this.storeDocumentFingerprint(fingerprint);
    this.documentFingerprints.set(documentId, fingerprint);

    return fingerprint;
  }

  private async storeDocumentFingerprint(fingerprint: DocumentFingerprint): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO document_fingerprints 
       (document_id, content_hash, structure_hash, embedding_version, last_processed, chunk_count) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        fingerprint.documentId,
        fingerprint.contentHash,
        fingerprint.structureHash,
        fingerprint.embeddingVersion,
        fingerprint.lastProcessed.toISOString(),
        fingerprint.chunkCount
      ]
    );
  }

  async checkDocumentNeedsReprocessing(
    documentId: string,
    contentHash: string,
    structureHash: string
  ): Promise<boolean> {
    const existing = await this.getDocumentFingerprint(documentId);
    
    if (!existing) return true;
    
    return (
      existing.contentHash !== contentHash ||
      existing.structureHash !== structureHash ||
      existing.embeddingVersion !== this.currentEmbeddingVersion.fingerprint
    );
  }

  private async getDocumentFingerprint(documentId: string): Promise<DocumentFingerprint | null> {
    const row = await this.db.get(
      'SELECT * FROM document_fingerprints WHERE document_id = ?',
      [documentId]
    );

    if (!row) return null;

    return {
      documentId: row.document_id,
      contentHash: row.content_hash,
      structureHash: row.structure_hash,
      embeddingVersion: row.embedding_version,
      lastProcessed: new Date(row.last_processed),
      chunkCount: row.chunk_count
    };
  }

  // Advanced Search with Multiple Strategies
  async advancedSearch(
    query: string,
    documentId: string,
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const {
      strategy = SearchStrategy.HYBRID,
      limit = 10,
      boostFactors
    } = options;

    logger.info('Performing advanced search', { 
      query: query.substring(0, 100), 
      documentId,
      strategy,
      options 
    });

    let results: VectorSearchResult[] = [];

    switch (strategy) {
      case SearchStrategy.SEMANTIC_ONLY:
        results = await this.searchSimilar(query, documentId, options);
        break;
      case SearchStrategy.TEXT_ONLY:
        results = await this.searchText(query, documentId, options);
        break;
      case SearchStrategy.HYBRID:
        results = await this.hybridSearch(query, documentId, options);
        break;
      case SearchStrategy.CONTEXTUAL:
        results = await this.contextualSearch(query, documentId, options);
        break;
    }

    // Apply boost factors if provided
    if (boostFactors) {
      results = this.applyBoostFactors(results, boostFactors);
    }

    // Re-rank and apply final scoring
    results = this.reRankResults(results, query);

    return results.slice(0, limit);
  }

  private async contextualSearch(
    query: string,
    documentId: string,
    options: SearchOptions
  ): Promise<VectorSearchResult[]> {
    // Get semantic results first
    const semanticResults = await this.searchSimilar(query, documentId, options);
    
    // Expand context by including adjacent chunks
    const expandedResults: VectorSearchResult[] = [];
    
    for (const result of semanticResults) {
      expandedResults.push(result);
      
      // Get adjacent chunks for better context
      const adjacentChunks = await this.getAdjacentChunks(result.chunk, documentId);
      
      for (const adjacentChunk of adjacentChunks) {
        const adjacentSimilarity = await this.computeQuerySimilarity(query, adjacentChunk);
        
        if (adjacentSimilarity > 0.5) { // Only include if somewhat relevant
          expandedResults.push({
            chunk: adjacentChunk,
            similarity: adjacentSimilarity * 0.8, // Reduce similarity for adjacent chunks
            rank: 0,
            explanations: ['Adjacent to highly relevant chunk']
          });
        }
      }
    }

    return expandedResults;
  }

  private async getAdjacentChunks(targetChunk: DocumentChunk, documentId: string): Promise<DocumentChunk[]> {
    const query = `
      SELECT 
        id, document_id, content, embedding,
        page_number, section_title, section_type,
        start_position, end_position, confidence, bounding_box,
        created_at
      FROM document_chunks 
      WHERE document_id = ?
        AND page_number BETWEEN ? AND ?
        AND section_type = ?
        AND id != ?
      ORDER BY start_position
    `;

    const pageRange = 1; // Look at chunks within 1 page
    const rows = await this.db.all(query, [
      documentId,
      Math.max(1, targetChunk.metadata.pageNumber - pageRange),
      targetChunk.metadata.pageNumber + pageRange,
      targetChunk.metadata.sectionType,
      targetChunk.id
    ]);

    return rows.map(row => this.deserializeChunk(row));
  }

  private async computeQuerySimilarity(query: string, chunk: DocumentChunk): Promise<number> {
    if (!chunk.embedding) return 0;
    
    const queryEmbedding = await this.getEmbedding(query);
    return cosineSimilarity(queryEmbedding, chunk.embedding);
  }

  private applyBoostFactors(results: VectorSearchResult[], boostFactors: BoostFactors): VectorSearchResult[] {
    return results.map(result => {
      let boostedScore = result.similarity;
      const explanations: string[] = [...(result.explanations || [])];

      // Section type boost
      const sectionBoost = boostFactors.sectionType[result.chunk.metadata.sectionType] || 1.0;
      boostedScore *= sectionBoost;
      if (sectionBoost > 1.0) {
        explanations.push(`Boosted for section type: ${result.chunk.metadata.sectionType}`);
      }

      // Keyword match boost
      if (boostFactors.keywordMatch > 1.0) {
        // Simple keyword matching - in production, use more sophisticated methods
        const queryWords = new Set(query.toLowerCase().split(/\s+/));
        const contentWords = new Set(result.chunk.content.toLowerCase().split(/\s+/));
        const intersection = new Set([...queryWords].filter(word => contentWords.has(word)));
        
        if (intersection.size > 0) {
          boostedScore *= (1 + (intersection.size / queryWords.size) * (boostFactors.keywordMatch - 1));
          explanations.push(`Keyword match boost: ${intersection.size} matches`);
        }
      }

      return {
        ...result,
        similarity: boostedScore,
        explanations
      };
    });
  }

  private reRankResults(results: VectorSearchResult[], query: string): VectorSearchResult[] {
    // Calculate relevance scores combining multiple factors
    const scoredResults = results.map(result => {
      let relevanceScore = result.similarity;

      // Length penalty for very short or very long chunks
      const contentLength = result.chunk.content.length;
      const optimalLength = 500; // Optimal chunk length
      const lengthPenalty = Math.exp(-Math.abs(contentLength - optimalLength) / 1000);
      relevanceScore *= (0.7 + 0.3 * lengthPenalty);

      // Diversity bonus - prefer results from different sections
      // (This would need more sophisticated implementation in production)

      return {
        ...result,
        relevanceScore,
        similarity: result.similarity // Keep original similarity
      };
    });

    // Sort by relevance score
    scoredResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Update ranks
    scoredResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    return scoredResults;
  }

  // Enhanced Caching and Performance
  async precomputeFrequentQueries(documentId: string, queries: string[]): Promise<void> {
    logger.info('Precomputing frequent queries', { documentId, queryCount: queries.length });

    for (const query of queries) {
      try {
        await this.getEmbedding(query); // This will cache the embedding
      } catch (error) {
        logger.warn('Failed to precompute query embedding', { query, error });
      }
    }
  }

  async warmupVectorCache(documentId: string): Promise<void> {
    logger.info('Warming up vector cache for document', { documentId });

    const chunks = await this.retrieveChunks(documentId, { includeContent: true });
    
    for (const chunk of chunks) {
      if (chunk.content && !this.embeddingCache.has(this.getCacheKey(chunk.content))) {
        try {
          await this.getEmbedding(chunk.content);
        } catch (error) {
          logger.warn('Failed to warm up chunk embedding', { chunkId: chunk.id, error });
        }
      }
    }

    logger.info('Vector cache warmup completed', { 
      documentId, 
      cachedEmbeddings: this.embeddingCache.size 
    });
  }

  // Backup and Restore
  async createBackup(documentId: string): Promise<{
    fingerprint: DocumentFingerprint | null;
    chunks: DocumentChunk[];
    embeddings: Map<string, number[]>;
  }> {
    const fingerprint = await this.getDocumentFingerprint(documentId);
    const chunks = await this.retrieveChunks(documentId, { includeContent: true });
    const embeddings = new Map<string, number[]>();

    for (const chunk of chunks) {
      if (chunk.embedding) {
        embeddings.set(chunk.id, chunk.embedding);
      }
    }

    return { fingerprint, chunks, embeddings };
  }

  async restoreFromBackup(
    backup: {
      fingerprint: DocumentFingerprint | null;
      chunks: DocumentChunk[];
      embeddings: Map<string, number[]>;
    }
  ): Promise<void> {
    if (backup.fingerprint) {
      await this.storeDocumentFingerprint(backup.fingerprint);
    }

    if (backup.chunks.length > 0) {
      await this.storeChunks(backup.chunks);
    }

    // Restore embeddings to cache
    for (const [chunkId, embedding] of backup.embeddings) {
      const chunk = backup.chunks.find(c => c.id === chunkId);
      if (chunk) {
        this.cacheEmbedding(chunk.content, embedding);
      }
    }
  }

  // Analytics and Monitoring
  async getSearchAnalytics(documentId: string, timeRange: { start: Date; end: Date }): Promise<{
    totalSearches: number;
    averageResultCount: number;
    popularQueries: Array<{ query: string; count: number }>;
    sectionPopularity: Record<SectionType, number>;
  }> {
    // This would require implementing search logging
    // For now, return placeholder data
    return {
      totalSearches: 0,
      averageResultCount: 0,
      popularQueries: [],
      sectionPopularity: {} as Record<SectionType, number>
    };
  }

  async optimizeEmbeddingStorage(): Promise<void> {
    // Implement embedding compression or optimization
    logger.info('Optimizing embedding storage');
    
    // Clear old cached embeddings
    if (this.embeddingCache.size > 10000) {
      const keysToDelete = Array.from(this.embeddingCache.keys()).slice(0, 1000);
      for (const key of keysToDelete) {
        this.embeddingCache.delete(key);
      }
    }
  }
}

// Export a factory function instead of instantiating immediately
let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore();
  }
  return vectorStoreInstance;
}

// For backward compatibility
export const vectorStore = new Proxy({} as VectorStore, {
  get: (target, prop) => {
    return getVectorStore()[prop as keyof VectorStore];
  }
});