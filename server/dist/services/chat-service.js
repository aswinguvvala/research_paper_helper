"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = exports.ChatService = void 0;
const types_1 = require("../types");
const connection_1 = require("../database/connection");
const rag_service_1 = require("./langchain/rag-service");
const context_manager_1 = require("./langchain/context-manager");
const workflow_service_1 = require("./langgraph/workflow-service");
const types_2 = require("../types");
const logger_1 = __importDefault(require("../utils/logger"));
class ChatService {
    constructor() {
        this.userFocusTracking = new Map();
        this.sessionCache = new Map();
        this.db = connection_1.databaseManager.database;
    }
    async processChat(request, options = {}) {
        const startTime = Date.now();
        try {
            logger_1.default.info('Processing chat request', {
                sessionId: request.sessionId,
                messageLength: request.message.length,
                educationLevel: request.educationLevel,
                hasHighlightedText: !!request.highlightedText
            });
            // Step 1: Get or create conversation session
            const session = await this.getOrCreateSession(request);
            // Step 2: Build conversation context
            const conversationContext = await this.buildConversationContext(session, request);
            // Step 3: Choose processing method (workflow vs traditional RAG)
            let response;
            if (options.useWorkflow !== false) {
                // Use LangGraph workflow for adaptive explanations
                response = await this.processWithWorkflow(request, conversationContext);
            }
            else {
                // Use traditional RAG pipeline
                response = await this.processWithRAG(request, conversationContext, options);
            }
            // Step 4: Save messages and update session
            await this.saveConversationTurn(session, request, response);
            // Step 5: Update user focus tracking
            if (options.trackUserFocus !== false) {
                await this.updateUserFocusTracking(session.id, request.message, response.message.content);
            }
            logger_1.default.info('Chat request processed successfully', {
                sessionId: request.sessionId,
                processingTime: Date.now() - startTime,
                tokensUsed: response.message.metadata?.tokens || 0
            });
            return response;
        }
        catch (error) {
            logger_1.default.error('Chat processing failed', {
                error,
                sessionId: request.sessionId
            });
            throw error;
        }
    }
    async processWithWorkflow(request, conversationContext) {
        const ragContext = {
            documentId: conversationContext.documentId,
            sessionId: conversationContext.sessionId,
            educationLevel: conversationContext.educationLevel,
            conversationHistory: conversationContext.messageHistory,
            highlightedText: request.highlightedText?.text
        };
        return await workflow_service_1.workflowService.processAdaptiveExplanation(request, ragContext);
    }
    async processWithRAG(request, conversationContext, options) {
        const ragContext = {
            documentId: conversationContext.documentId,
            sessionId: conversationContext.sessionId,
            educationLevel: conversationContext.educationLevel,
            conversationHistory: conversationContext.messageHistory,
            highlightedText: request.highlightedText?.text
        };
        const ragResponse = await rag_service_1.ragService.processQuery(request, ragContext);
        // Convert RAG response to ChatResponse format
        const response = {
            message: {
                id: (0, types_2.generateId)(),
                role: types_1.MessageRole.ASSISTANT,
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
    async buildConversationContext(session, request) {
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
    async getOrCreateSession(request) {
        // Check cache first
        if (this.sessionCache.has(request.sessionId)) {
            return this.sessionCache.get(request.sessionId);
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
    extractDocumentId(request) {
        // Extract document ID from context or request
        // For now, assume it's provided in the request context
        return request.context?.[0] || 'unknown';
    }
    async createSession(params) {
        const now = new Date();
        const metadata = {
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
        const session = {
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
    async getSession(sessionId) {
        const row = await this.db.get(`
      SELECT * FROM conversation_sessions WHERE id = ?
    `, [sessionId]);
        if (!row)
            return null;
        return {
            id: row.id,
            documentId: row.document_id,
            userId: row.user_id,
            educationLevel: row.education_level,
            messages: [], // Messages loaded separately
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            metadata: JSON.parse(row.metadata || '{}')
        };
    }
    async getRecentMessages(sessionId, limit = 10) {
        const rows = await this.db.all(`
      SELECT * FROM chat_messages 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [sessionId, limit]);
        return rows.reverse().map(row => ({
            id: row.id,
            role: row.role,
            content: row.content,
            timestamp: new Date(row.timestamp),
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        }));
    }
    async saveConversationTurn(session, request, response) {
        await this.db.run('BEGIN TRANSACTION');
        try {
            // Save user message
            await this.db.run(`
        INSERT INTO chat_messages (
          id, session_id, role, content, timestamp, highlighted_text,
          citations, related_chunks, confidence, tokens, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                (0, types_2.generateId)(),
                session.id,
                types_1.MessageRole.USER,
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
                types_1.MessageRole.ASSISTANT,
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
        }
        catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }
    async updateSessionStats(session, response) {
        const newMessageCount = session.metadata.totalMessages + 2; // User + assistant
        const newTokenCount = session.metadata.totalTokens + (response.message.metadata?.tokens || 0);
        const newAvgResponseTime = ((session.metadata.averageResponseTime * session.metadata.totalMessages + response.processingTime) /
            newMessageCount);
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
    async updateUserFocusTracking(sessionId, userMessage, assistantResponse) {
        const currentFocus = this.userFocusTracking.get(sessionId) || [];
        const updatedFocus = context_manager_1.contextManager.updateUserFocus(currentFocus, userMessage, assistantResponse);
        this.userFocusTracking.set(sessionId, updatedFocus);
    }
    // Advanced Features
    async generateStudyGuide(documentId, educationLevel, topics) {
        logger_1.default.info('Generating study guide', { documentId, educationLevel, topics });
        // Use research analysis workflow to create study materials
        const analysisResult = await workflow_service_1.workflowService.processResearchAnalysis(documentId, 'implications', educationLevel);
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
    async getConversationSummary(sessionId) {
        const messages = await this.getRecentMessages(sessionId, 50);
        return await context_manager_1.contextManager.summarizeConversation(messages, 1000);
    }
    async getSessionAnalytics(sessionId) {
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
            engagementLevel: engagementLevel
        };
    }
    // Cleanup and maintenance
    async cleanupExpiredSessions(maxAgeHours = 24) {
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
        logger_1.default.info('Cleaned up expired sessions', {
            deletedCount: result.changes,
            cutoffTime: cutoffTime.toISOString()
        });
        return result.changes || 0;
    }
    clearCache() {
        this.sessionCache.clear();
        this.userFocusTracking.clear();
        logger_1.default.info('Chat service cache cleared');
    }
}
exports.ChatService = ChatService;
exports.chatService = new ChatService();
