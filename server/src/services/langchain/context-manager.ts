import { Document } from '@langchain/core/documents';
import { 
  DocumentChunk, 
  ChatMessage, 
  Citation, 
  EducationLevel,
  MessageRole,
  HighlightedContent
} from '../../types';
import { VectorSearchResult } from '../document/vector-store';
import logger from '../../utils/logger';
import { generateId } from '../../types';

export interface ContextWindow {
  chunks: DocumentChunk[];
  totalTokens: number;
  relevanceScores: number[];
  citations: Citation[];
  compressionRatio: number;
}

export interface ConversationContext {
  sessionId: string;
  documentId: string;
  messageHistory: ChatMessage[];
  currentQuery: string;
  educationLevel: EducationLevel;
  highlightedContent?: HighlightedContent;
  userFocus: string[]; // Topics the user has shown interest in
  conceptualMap: Map<string, string[]>; // Concept to related concepts mapping
}

export interface ContextOptimizationOptions {
  maxTokens: number;
  targetCompression: number;
  preserveCoherence: boolean;
  prioritizeRecent: boolean;
  educationLevelAdjustment: boolean;
}

export class ContextManager {
  private readonly maxContextTokens = 8000; // Conservative token limit
  private readonly compressionTargets = new Map<EducationLevel, number>([
    [EducationLevel.HIGH_SCHOOL, 0.3], // More compression for simpler explanations
    [EducationLevel.NO_TECHNICAL, 0.3],
    [EducationLevel.UNDERGRADUATE, 0.5],
    [EducationLevel.MASTERS, 0.7],
    [EducationLevel.PHD, 0.8] // Less compression for advanced users
  ]);

  async optimizeContext(
    searchResults: VectorSearchResult[],
    conversationContext: ConversationContext,
    options: ContextOptimizationOptions
  ): Promise<ContextWindow> {
    logger.info('Optimizing context for conversation', {
      sessionId: conversationContext.sessionId,
      resultCount: searchResults.length,
      educationLevel: conversationContext.educationLevel
    });

    // Step 1: Rank and filter results
    const rankedResults = await this.rankResultsByRelevance(
      searchResults,
      conversationContext
    );

    // Step 2: Select optimal chunks within token budget
    const selectedChunks = this.selectOptimalChunks(
      rankedResults,
      options.maxTokens
    );

    // Step 3: Apply context compression
    const compressedContext = await this.compressContext(
      selectedChunks,
      conversationContext.educationLevel,
      options.targetCompression
    );

    // Step 4: Generate citations
    const citations = this.generateContextCitations(compressedContext);

    // Step 5: Ensure coherence
    const finalContext = options.preserveCoherence 
      ? await this.ensureCoherence(compressedContext, conversationContext)
      : compressedContext;

    const contextWindow: ContextWindow = {
      chunks: finalContext,
      totalTokens: this.estimateTokens(finalContext),
      relevanceScores: finalContext.map(() => 0.8), // Placeholder
      citations,
      compressionRatio: finalContext.length / selectedChunks.length
    };

    logger.info('Context optimization completed', {
      sessionId: conversationContext.sessionId,
      originalChunks: searchResults.length,
      finalChunks: finalContext.length,
      totalTokens: contextWindow.totalTokens,
      compressionRatio: contextWindow.compressionRatio
    });

    return contextWindow;
  }

  private async rankResultsByRelevance(
    results: VectorSearchResult[],
    conversationContext: ConversationContext
  ): Promise<VectorSearchResult[]> {
    // Apply multi-factor ranking
    const rankedResults = results.map(result => {
      let adjustedScore = result.similarity;

      // Boost based on conversation history relevance
      adjustedScore *= this.calculateConversationRelevanceBoost(
        result.chunk,
        conversationContext.messageHistory
      );

      // Boost based on user focus areas
      adjustedScore *= this.calculateFocusAreaBoost(
        result.chunk,
        conversationContext.userFocus
      );

      // Boost based on highlighted content
      if (conversationContext.highlightedContent) {
        adjustedScore *= this.calculateHighlightRelevanceBoost(
          result.chunk,
          conversationContext.highlightedContent
        );
      }

      // Education level adjustment
      adjustedScore *= this.getEducationLevelMultiplier(
        result.chunk,
        conversationContext.educationLevel
      );

      return {
        ...result,
        relevanceScore: adjustedScore
      };
    });

    return rankedResults.sort((a, b) => 
      (b.relevanceScore || b.similarity) - (a.relevanceScore || a.similarity)
    );
  }

  private calculateConversationRelevanceBoost(
    chunk: DocumentChunk,
    messageHistory: ChatMessage[]
  ): number {
    if (messageHistory.length === 0) return 1.0;

    // Extract key terms from recent conversation
    const recentMessages = messageHistory.slice(-6);
    const conversationTerms = new Set(
      recentMessages
        .map(msg => msg.content.toLowerCase().split(/\s+/))
        .flat()
        .filter(term => term.length > 3)
    );

    const chunkTerms = new Set(
      chunk.content.toLowerCase().split(/\s+/)
    );

    // Calculate term overlap
    const overlap = new Set([...conversationTerms].filter(term => chunkTerms.has(term)));
    const overlapRatio = overlap.size / Math.max(conversationTerms.size, 1);

    return 1.0 + overlapRatio * 0.3; // Up to 30% boost
  }

  private calculateFocusAreaBoost(
    chunk: DocumentChunk,
    userFocus: string[]
  ): number {
    if (userFocus.length === 0) return 1.0;

    const chunkContent = chunk.content.toLowerCase();
    const focusMatches = userFocus.filter(focus => 
      chunkContent.includes(focus.toLowerCase())
    ).length;

    return 1.0 + (focusMatches / userFocus.length) * 0.2; // Up to 20% boost
  }

  private calculateHighlightRelevanceBoost(
    chunk: DocumentChunk,
    highlighted: HighlightedContent
  ): number {
    // Check if chunk is from the same page or section as highlighted content
    if (chunk.metadata.pageNumber === highlighted.pageNumber) {
      return 1.4; // 40% boost for same page
    }

    // Check for content similarity
    const highlightTerms = new Set(highlighted.text.toLowerCase().split(/\s+/));
    const chunkTerms = new Set(chunk.content.toLowerCase().split(/\s+/));
    const overlap = new Set([...highlightTerms].filter(term => chunkTerms.has(term)));
    
    if (overlap.size > 0) {
      return 1.0 + (overlap.size / highlightTerms.size) * 0.3;
    }

    return 1.0;
  }

  private getEducationLevelMultiplier(
    chunk: DocumentChunk,
    educationLevel: EducationLevel
  ): number {
    const sectionType = chunk.metadata.sectionType;

    switch (educationLevel) {
      case EducationLevel.HIGH_SCHOOL:
      case EducationLevel.NO_TECHNICAL:
        // Prefer introduction, conclusion, discussion
        const simpleSections = ['introduction', 'conclusion', 'discussion'];
        return simpleSections.includes(sectionType) ? 1.2 : 0.9;

      case EducationLevel.UNDERGRADUATE:
        // Balanced approach
        return sectionType === 'methodology' ? 0.9 : 1.0;

      case EducationLevel.MASTERS:
      case EducationLevel.PHD:
        // Prefer methodology and results
        const advancedSections = ['methodology', 'results'];
        return advancedSections.includes(sectionType) ? 1.1 : 1.0;

      default:
        return 1.0;
    }
  }

  private selectOptimalChunks(
    rankedResults: VectorSearchResult[],
    maxTokens: number
  ): DocumentChunk[] {
    const selectedChunks: DocumentChunk[] = [];
    let currentTokens = 0;

    for (const result of rankedResults) {
      const chunkTokens = this.estimateChunkTokens(result.chunk);
      
      if (currentTokens + chunkTokens <= maxTokens) {
        selectedChunks.push(result.chunk);
        currentTokens += chunkTokens;
      } else {
        break;
      }
    }

    return selectedChunks;
  }

  private async compressContext(
    chunks: DocumentChunk[],
    educationLevel: EducationLevel,
    targetCompression: number
  ): Promise<DocumentChunk[]> {
    const compressionTarget = this.compressionTargets.get(educationLevel) || 0.5;
    const effectiveTarget = Math.min(targetCompression, compressionTarget);

    if (effectiveTarget >= 1.0) return chunks;

    const targetChunkCount = Math.ceil(chunks.length * effectiveTarget);
    
    // For now, simple selection of top chunks
    // In production, implement semantic compression
    return chunks.slice(0, targetChunkCount);
  }

  private generateContextCitations(chunks: DocumentChunk[]): Citation[] {
    return chunks.map((chunk, index) => ({
      chunkId: chunk.id,
      pageNumber: chunk.metadata.pageNumber,
      confidence: 0.9,
      relevanceScore: 0.9 - (index * 0.1) // Decreasing relevance by order
    }));
  }

  private async ensureCoherence(
    chunks: DocumentChunk[],
    conversationContext: ConversationContext
  ): Promise<DocumentChunk[]> {
    // Sort chunks by page number and section to maintain reading order
    const sortedChunks = [...chunks].sort((a, b) => {
      if (a.metadata.pageNumber !== b.metadata.pageNumber) {
        return a.metadata.pageNumber - b.metadata.pageNumber;
      }
      return a.metadata.startPosition - b.metadata.startPosition;
    });

    // Identify and fill gaps if necessary
    const coherentChunks = this.fillCoherenceGaps(sortedChunks);

    return coherentChunks;
  }

  private fillCoherenceGaps(chunks: DocumentChunk[]): DocumentChunk[] {
    // Simple implementation - in production, use more sophisticated gap detection
    return chunks;
  }

  private estimateChunkTokens(chunk: DocumentChunk): number {
    return Math.ceil(chunk.content.length / 4); // ~4 characters per token
  }

  private estimateTokens(chunks: DocumentChunk[]): number {
    return chunks.reduce((total, chunk) => total + this.estimateChunkTokens(chunk), 0);
  }

  // Conversation Summarization
  async summarizeConversation(
    messages: ChatMessage[],
    maxTokens: number = 1000
  ): Promise<string> {
    if (messages.length === 0) return '';

    // Group messages into topics/themes
    const topics = this.extractConversationTopics(messages);
    
    // Create a concise summary focusing on key points
    const summary = topics
      .slice(0, 5) // Top 5 topics
      .map(topic => `- ${topic}`)
      .join('\n');

    return summary;
  }

  private extractConversationTopics(messages: ChatMessage[]): string[] {
    // Simple keyword extraction - in production, use NLP
    const allText = messages.map(msg => msg.content).join(' ');
    const words = allText.toLowerCase().split(/\s+/);
    
    const wordFreq = new Map<string, number>();
    words
      .filter(word => word.length > 4 && !this.isStopWord(word))
      .forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      });

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => entry[0]);
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }

  // Citation Management
  validateCitations(citations: Citation[], chunks: DocumentChunk[]): Citation[] {
    const validChunkIds = new Set(chunks.map(chunk => chunk.id));
    
    return citations.filter(citation => {
      const isValid = validChunkIds.has(citation.chunkId);
      if (!isValid) {
        logger.warn('Invalid citation found', { citation });
      }
      return isValid;
    });
  }

  enrichCitations(citations: Citation[], chunks: DocumentChunk[]): Citation[] {
    const chunkMap = new Map(chunks.map(chunk => [chunk.id, chunk]));
    
    return citations.map(citation => {
      const chunk = chunkMap.get(citation.chunkId);
      if (chunk) {
        return {
          ...citation,
          // Add additional metadata that might be useful for display
          sectionTitle: chunk.metadata.sectionTitle,
          sectionType: chunk.metadata.sectionType
        } as Citation & { sectionTitle?: string; sectionType?: string };
      }
      return citation;
    });
  }

  // User Focus Tracking
  updateUserFocus(
    currentFocus: string[],
    newMessage: string,
    response: string
  ): string[] {
    // Extract key concepts from the conversation
    const messageConcepts = this.extractConcepts(newMessage);
    const responseConcepts = this.extractConcepts(response);
    
    const newConcepts = [...messageConcepts, ...responseConcepts];
    
    // Merge with existing focus, giving weight to recent concepts
    const updatedFocus = [...currentFocus];
    
    newConcepts.forEach(concept => {
      if (!updatedFocus.includes(concept)) {
        updatedFocus.push(concept);
      }
    });

    // Keep only the most recent focus areas (max 20)
    return updatedFocus.slice(-20);
  }

  private extractConcepts(text: string): string[] {
    // Simple concept extraction - in production, use NLP
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));
    
    return [...new Set(words)].slice(0, 5);
  }

  // Performance Analytics
  getContextMetrics(contextWindow: ContextWindow): {
    tokenEfficiency: number;
    relevanceCoverage: number;
    citationQuality: number;
  } {
    return {
      tokenEfficiency: Math.min(1.0, 1000 / contextWindow.totalTokens), // Prefer concise contexts
      relevanceCoverage: contextWindow.relevanceScores.reduce((sum, score) => sum + score, 0) / contextWindow.relevanceScores.length,
      citationQuality: contextWindow.citations.reduce((sum, citation) => sum + citation.confidence, 0) / contextWindow.citations.length
    };
  }
}

export const contextManager = new ContextManager();