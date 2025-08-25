import { Database } from 'sqlite';
import {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ConversationSession,
  EducationLevel,
  MessageRole,
  Citation,
  SessionMetadata,
  HighlightedContent
} from '../types';
import { databaseManager } from '../database/connection';
import { ragService, RAGContext } from './langchain/rag-service';
import { contextManager, ConversationContext } from './langchain/context-manager';
import { workflowService } from './langgraph/workflow-service';
import { vectorStore, SearchStrategy } from './document/vector-store';
import { generateId } from '../types';
import logger from '../utils/logger';

export interface EnhancedChatOptions {
  useWorkflow?: boolean;
  searchStrategy?: SearchStrategy;
  maxContextTokens?: number;
  enableContextOptimization?: boolean;
  trackUserFocus?: boolean;
}

export class ChatService {
  private db: Database;
  private userFocusTracking = new Map<string, string[]>();
  private sessionCache = new Map<string, ConversationSession>();

  constructor() {
    this.db = databaseManager.database;
  }

  async processChat(
    request: ChatRequest,
    options: EnhancedChatOptions = {}
  ): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      logger.info('Processing chat request', {
        sessionId: request.sessionId,
        messageLength: request.message.length,
        educationLevel: request.educationLevel,
        hasHighlightedText: !!request.highlightedText
      });

      // Step 1: Get or create conversation session
      const session = await this.getOrCreateSession(request);

      // Step 2: Build conversation context
      const conversationContext = await this.buildConversationContext(
        session,
        request
      );

      // Step 3: Choose processing method (workflow vs traditional RAG)
      let response: ChatResponse;
      
      if (options.useWorkflow !== false) {
        // Use LangGraph workflow for adaptive explanations
        response = await this.processWithWorkflow(request, conversationContext);
      } else {
        // Use traditional RAG pipeline
        response = await this.processWithRAG(request, conversationContext, options);
      }

      // Step 4: Save messages and update session
      await this.saveConversationTurn(session, request, response);

      // Step 5: Update user focus tracking
      if (options.trackUserFocus !== false) {
        await this.updateUserFocusTracking(session.id, request.message, response.message.content);
      }

      logger.info('Chat request processed successfully', {
        sessionId: request.sessionId,
        processingTime: Date.now() - startTime,
        tokensUsed: response.message.metadata?.tokens || 0
      });

      return response;

    } catch (error) {
      logger.error('Chat processing failed', {
        error,
        sessionId: request.sessionId
      });
      throw error;
    }
  }

  private async processWithWorkflow(
    request: ChatRequest,
    conversationContext: ConversationContext
  ): Promise<ChatResponse> {
    const ragContext: RAGContext = {
      documentId: conversationContext.documentId,
      sessionId: conversationContext.sessionId,
      educationLevel: conversationContext.educationLevel,
      conversationHistory: conversationContext.messageHistory,
      highlightedText: request.highlightedText?.text
    };

    return await workflowService.processAdaptiveExplanation(request, ragContext);
  }

  private async processWithRAG(
    request: ChatRequest,
    conversationContext: ConversationContext,
    options: EnhancedChatOptions
  ): Promise<ChatResponse> {
    const ragContext: RAGContext = {
      documentId: conversationContext.documentId,
      sessionId: conversationContext.sessionId,
      educationLevel: conversationContext.educationLevel,
      conversationHistory: conversationContext.messageHistory,
      highlightedText: request.highlightedText?.text
    };

    const ragResponse = await ragService.processQuery(request, ragContext);

    // Convert RAG response to ChatResponse format
    const response: ChatResponse = {
      message: {
        id: generateId(),
        role: MessageRole.ASSISTANT,
        content: ragResponse.answer,
        timestamp: new Date(),
        metadata: {
          educationLevel: conversationContext.educationLevel,
          highlightedText: request.highlightedText,
          citations: ragResponse.citations,
          relatedChunks: ragResponse.contextUsed.map(chunk => chunk.id),
          confidence: ragResponse.confidence,
          tokens: ragResponse.tokensUsed
        }
      },
      citations: ragResponse.citations,
      suggestedQuestions: ragResponse.suggestedQuestions,
      processingTime: ragResponse.processingTime
    };

    return response;
  }

  private async buildConversationContext(
    session: ConversationSession,
    request: ChatRequest
  ): Promise<ConversationContext> {
    // Get recent message history
    const messageHistory = await this.getRecentMessages(session.id, 10);

    // Get user focus areas
    const userFocus = this.userFocusTracking.get(session.id) || [];

    return {
      sessionId: session.id,
      documentId: session.documentId,
      messageHistory,
      currentQuery: request.message,
      educationLevel: request.educationLevel,
      highlightedContent: request.highlightedText,
      userFocus,
      conceptualMap: new Map() // Placeholder for future implementation
    };
  }

  private async getOrCreateSession(request: ChatRequest): Promise<ConversationSession> {
    // Check cache first
    if (this.sessionCache.has(request.sessionId)) {
      return this.sessionCache.get(request.sessionId)!;
    }

    // Try to get existing session
    let session = await this.getSession(request.sessionId);

    if (!session) {
      // Create new session
      session = await this.createSession({
        id: request.sessionId,
        documentId: this.extractDocumentId(request),
        educationLevel: request.educationLevel,
        userId: undefined // Could be extracted from authentication context
      });
    }

    // Cache the session
    this.sessionCache.set(session.id, session);
    return session;
  }

  private extractDocumentId(request: ChatRequest): string {
    // Extract document ID from request directly or fallback to context
    return request.documentId || request.context?.[0] || 'unknown';
  }

  private async createSession(params: {
    id: string;
    documentId: string;
    educationLevel: EducationLevel;
    userId?: string;
  }): Promise<ConversationSession> {
    const now = new Date();
    const metadata: SessionMetadata = {
      totalMessages: 0,
      totalTokens: 0,
      averageResponseTime: 0,
      topics: [],
      highlights: []
    };

    await this.db.run(`
      INSERT INTO conversation_sessions (
        id, document_id, user_id, education_level,
        created_at, updated_at, total_messages, total_tokens, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      params.id,
      params.documentId,
      params.userId,
      params.educationLevel,
      now.toISOString(),
      now.toISOString(),
      0,
      0,
      JSON.stringify(metadata)
    ]);

    const session: ConversationSession = {
      id: params.id,
      documentId: params.documentId,
      userId: params.userId,
      educationLevel: params.educationLevel,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata
    };

    return session;
  }

  private async getSession(sessionId: string): Promise<ConversationSession | null> {
    const row = await this.db.get(`
      SELECT * FROM conversation_sessions WHERE id = ?
    `, [sessionId]);

    if (!row) return null;

    return {
      id: row.id,
      documentId: row.document_id,
      userId: row.user_id,
      educationLevel: row.education_level as EducationLevel,
      messages: [], // Messages loaded separately
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  private async getRecentMessages(sessionId: string, limit: number = 10): Promise<ChatMessage[]> {
    const rows = await this.db.all(`
      SELECT * FROM chat_messages 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [sessionId, limit]);

    return rows.reverse().map(row => ({
      id: row.id,
      role: row.role as MessageRole,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  private async saveConversationTurn(
    session: ConversationSession,
    request: ChatRequest,
    response: ChatResponse
  ): Promise<void> {
    await this.db.run('BEGIN TRANSACTION');

    try {
      // Save user message
      await this.db.run(`
        INSERT INTO chat_messages (
          id, session_id, role, content, timestamp, highlighted_text,
          citations, related_chunks, confidence, tokens, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        generateId(),
        session.id,
        MessageRole.USER,
        request.message,
        new Date().toISOString(),
        request.highlightedText ? JSON.stringify(request.highlightedText) : null,
        null,
        null,
        null,
        null,
        null
      ]);

      // Save assistant message
      await this.db.run(`
        INSERT INTO chat_messages (
          id, session_id, role, content, timestamp, highlighted_text,
          citations, related_chunks, confidence, tokens, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        response.message.id,
        session.id,
        MessageRole.ASSISTANT,
        response.message.content,
        response.message.timestamp.toISOString(),
        null,
        JSON.stringify(response.citations || []),
        JSON.stringify(response.message.metadata?.relatedChunks || []),
        response.message.metadata?.confidence,
        response.message.metadata?.tokens,
        JSON.stringify(response.message.metadata || {})
      ]);

      // Update session statistics
      await this.updateSessionStats(session, response);

      await this.db.run('COMMIT');
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  private async updateSessionStats(
    session: ConversationSession,
    response: ChatResponse
  ): Promise<void> {
    const newMessageCount = session.metadata.totalMessages + 2; // User + assistant
    const newTokenCount = session.metadata.totalTokens + (response.message.metadata?.tokens || 0);
    const newAvgResponseTime = (
      (session.metadata.averageResponseTime * session.metadata.totalMessages + response.processingTime) /
      newMessageCount
    );

    await this.db.run(`
      UPDATE conversation_sessions 
      SET total_messages = ?, total_tokens = ?, updated_at = ?,
          metadata = json_set(metadata, '$.totalMessages', ?, '$.totalTokens', ?, '$.averageResponseTime', ?)
      WHERE id = ?
    `, [
      newMessageCount,
      newTokenCount,
      new Date().toISOString(),
      newMessageCount,
      newTokenCount,
      Math.round(newAvgResponseTime),
      session.id
    ]);

    // Update cached session
    session.metadata.totalMessages = newMessageCount;
    session.metadata.totalTokens = newTokenCount;
    session.metadata.averageResponseTime = Math.round(newAvgResponseTime);
    session.updatedAt = new Date();

    this.sessionCache.set(session.id, session);
  }

  private async updateUserFocusTracking(
    sessionId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    const currentFocus = this.userFocusTracking.get(sessionId) || [];
    const updatedFocus = contextManager.updateUserFocus(
      currentFocus,
      userMessage,
      assistantResponse
    );
    
    this.userFocusTracking.set(sessionId, updatedFocus);
  }

  // Advanced Features
  async generateStudyGuide(
    documentId: string,
    educationLevel: EducationLevel,
    topics?: string[]
  ): Promise<{
    outline: string[];
    keyQuestions: string[];
    practiceProblems: string[];
    additionalResources: string[];
  }> {
    logger.info('Generating study guide', { documentId, educationLevel, topics });

    // Use research analysis workflow to create study materials
    const analysisResult = await workflowService.processResearchAnalysis(
      documentId,
      'implications',
      educationLevel
    );

    // Generate study guide components
    const studyGuide = {
      outline: [
        'Introduction and Background',
        'Key Concepts and Definitions',
        'Methodology and Approach',
        'Main Findings and Results',
        'Implications and Applications',
        'Limitations and Future Work'
      ],
      keyQuestions: [
        'What problem does this research address?',
        'What methods were used to investigate the problem?',
        'What were the main findings?',
        'How do these findings impact the field?',
        'What are the limitations of this study?'
      ],
      practiceProblems: [
        'Summarize the main hypothesis in your own words',
        'Identify potential confounding variables',
        'Propose alternative experimental designs',
        'Critique the statistical analysis methods'
      ],
      additionalResources: [
        'Related papers in the field',
        'Background reading on methodology',
        'Software tools used in the research'
      ]
    };

    return studyGuide;
  }

  async getConversationSummary(sessionId: string): Promise<string> {
    const messages = await this.getRecentMessages(sessionId, 50);
    return await contextManager.summarizeConversation(messages, 1000);
  }

  async getSessionAnalytics(sessionId: string): Promise<{
    messageCount: number;
    tokensUsed: number;
    averageResponseTime: number;
    topTopics: string[];
    engagementLevel: 'low' | 'medium' | 'high';
  }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const messages = await this.getRecentMessages(sessionId, 100);
    
    // Simple engagement scoring based on message length and frequency
    const avgMessageLength = messages.reduce((sum, msg) => sum + msg.content.length, 0) / messages.length;
    const engagementLevel = avgMessageLength > 200 ? 'high' : avgMessageLength > 100 ? 'medium' : 'low';

    return {
      messageCount: session.metadata.totalMessages,
      tokensUsed: session.metadata.totalTokens,
      averageResponseTime: session.metadata.averageResponseTime,
      topTopics: session.metadata.topics,
      engagementLevel: engagementLevel as 'low' | 'medium' | 'high'
    };
  }

  // Cleanup and maintenance
  async cleanupExpiredSessions(maxAgeHours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    const result = await this.db.run(`
      DELETE FROM conversation_sessions 
      WHERE updated_at < ?
    `, [cutoffTime.toISOString()]);

    // Clear from cache
    for (const [sessionId, session] of this.sessionCache.entries()) {
      if (session.updatedAt < cutoffTime) {
        this.sessionCache.delete(sessionId);
        this.userFocusTracking.delete(sessionId);
      }
    }

    logger.info('Cleaned up expired sessions', { 
      deletedCount: result.changes, 
      cutoffTime: cutoffTime.toISOString() 
    });

    return result.changes || 0;
  }

  clearCache(): void {
    this.sessionCache.clear();
    this.userFocusTracking.clear();
    logger.info('Chat service cache cleared');
  }
}

// Export a factory function instead of instantiating immediately
let chatServiceInstance: ChatService | null = null;

export function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService();
  }
  return chatServiceInstance;
}

// For backward compatibility
export const chatService = new Proxy({} as ChatService, {
  get: (target, prop) => {
    return getChatService()[prop as keyof ChatService];
  }
});