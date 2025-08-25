"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextManager = exports.ContextManager = void 0;
const types_1 = require("../types");
const logger_1 = __importDefault(require("../../utils/logger"));
class ContextManager {
    constructor() {
        this.maxContextTokens = 8000; // Conservative token limit
        this.compressionTargets = new Map([
            [types_1.EducationLevel.HIGH_SCHOOL, 0.3], // More compression for simpler explanations
            [types_1.EducationLevel.NO_TECHNICAL, 0.3],
            [types_1.EducationLevel.UNDERGRADUATE, 0.5],
            [types_1.EducationLevel.MASTERS, 0.7],
            [types_1.EducationLevel.PHD, 0.8] // Less compression for advanced users
        ]);
    }
    async optimizeContext(searchResults, conversationContext, options) {
        logger_1.default.info('Optimizing context for conversation', {
            sessionId: conversationContext.sessionId,
            resultCount: searchResults.length,
            educationLevel: conversationContext.educationLevel
        });
        // Step 1: Rank and filter results
        const rankedResults = await this.rankResultsByRelevance(searchResults, conversationContext);
        // Step 2: Select optimal chunks within token budget
        const selectedChunks = this.selectOptimalChunks(rankedResults, options.maxTokens);
        // Step 3: Apply context compression
        const compressedContext = await this.compressContext(selectedChunks, conversationContext.educationLevel, options.targetCompression);
        // Step 4: Generate citations
        const citations = this.generateContextCitations(compressedContext);
        // Step 5: Ensure coherence
        const finalContext = options.preserveCoherence
            ? await this.ensureCoherence(compressedContext, conversationContext)
            : compressedContext;
        const contextWindow = {
            chunks: finalContext,
            totalTokens: this.estimateTokens(finalContext),
            relevanceScores: finalContext.map(() => 0.8), // Placeholder
            citations,
            compressionRatio: finalContext.length / selectedChunks.length
        };
        logger_1.default.info('Context optimization completed', {
            sessionId: conversationContext.sessionId,
            originalChunks: searchResults.length,
            finalChunks: finalContext.length,
            totalTokens: contextWindow.totalTokens,
            compressionRatio: contextWindow.compressionRatio
        });
        return contextWindow;
    }
    async rankResultsByRelevance(results, conversationContext) {
        // Apply multi-factor ranking
        const rankedResults = results.map(result => {
            let adjustedScore = result.similarity;
            // Boost based on conversation history relevance
            adjustedScore *= this.calculateConversationRelevanceBoost(result.chunk, conversationContext.messageHistory);
            // Boost based on user focus areas
            adjustedScore *= this.calculateFocusAreaBoost(result.chunk, conversationContext.userFocus);
            // Boost based on highlighted content
            if (conversationContext.highlightedContent) {
                adjustedScore *= this.calculateHighlightRelevanceBoost(result.chunk, conversationContext.highlightedContent);
            }
            // Education level adjustment
            adjustedScore *= this.getEducationLevelMultiplier(result.chunk, conversationContext.educationLevel);
            return {
                ...result,
                relevanceScore: adjustedScore
            };
        });
        return rankedResults.sort((a, b) => (b.relevanceScore || b.similarity) - (a.relevanceScore || a.similarity));
    }
    calculateConversationRelevanceBoost(chunk, messageHistory) {
        if (messageHistory.length === 0)
            return 1.0;
        // Extract key terms from recent conversation
        const recentMessages = messageHistory.slice(-6);
        const conversationTerms = new Set(recentMessages
            .map(msg => msg.content.toLowerCase().split(/\s+/))
            .flat()
            .filter(term => term.length > 3));
        const chunkTerms = new Set(chunk.content.toLowerCase().split(/\s+/));
        // Calculate term overlap
        const overlap = new Set([...conversationTerms].filter(term => chunkTerms.has(term)));
        const overlapRatio = overlap.size / Math.max(conversationTerms.size, 1);
        return 1.0 + overlapRatio * 0.3; // Up to 30% boost
    }
    calculateFocusAreaBoost(chunk, userFocus) {
        if (userFocus.length === 0)
            return 1.0;
        const chunkContent = chunk.content.toLowerCase();
        const focusMatches = userFocus.filter(focus => chunkContent.includes(focus.toLowerCase())).length;
        return 1.0 + (focusMatches / userFocus.length) * 0.2; // Up to 20% boost
    }
    calculateHighlightRelevanceBoost(chunk, highlighted) {
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
    getEducationLevelMultiplier(chunk, educationLevel) {
        const sectionType = chunk.metadata.sectionType;
        switch (educationLevel) {
            case types_1.EducationLevel.HIGH_SCHOOL:
            case types_1.EducationLevel.NO_TECHNICAL:
                // Prefer introduction, conclusion, discussion
                const simpleSections = ['introduction', 'conclusion', 'discussion'];
                return simpleSections.includes(sectionType) ? 1.2 : 0.9;
            case types_1.EducationLevel.UNDERGRADUATE:
                // Balanced approach
                return sectionType === 'methodology' ? 0.9 : 1.0;
            case types_1.EducationLevel.MASTERS:
            case types_1.EducationLevel.PHD:
                // Prefer methodology and results
                const advancedSections = ['methodology', 'results'];
                return advancedSections.includes(sectionType) ? 1.1 : 1.0;
            default:
                return 1.0;
        }
    }
    selectOptimalChunks(rankedResults, maxTokens) {
        const selectedChunks = [];
        let currentTokens = 0;
        for (const result of rankedResults) {
            const chunkTokens = this.estimateChunkTokens(result.chunk);
            if (currentTokens + chunkTokens <= maxTokens) {
                selectedChunks.push(result.chunk);
                currentTokens += chunkTokens;
            }
            else {
                break;
            }
        }
        return selectedChunks;
    }
    async compressContext(chunks, educationLevel, targetCompression) {
        const compressionTarget = this.compressionTargets.get(educationLevel) || 0.5;
        const effectiveTarget = Math.min(targetCompression, compressionTarget);
        if (effectiveTarget >= 1.0)
            return chunks;
        const targetChunkCount = Math.ceil(chunks.length * effectiveTarget);
        // For now, simple selection of top chunks
        // In production, implement semantic compression
        return chunks.slice(0, targetChunkCount);
    }
    generateContextCitations(chunks) {
        return chunks.map((chunk, index) => ({
            chunkId: chunk.id,
            pageNumber: chunk.metadata.pageNumber,
            confidence: 0.9,
            relevanceScore: 0.9 - (index * 0.1) // Decreasing relevance by order
        }));
    }
    async ensureCoherence(chunks, conversationContext) {
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
    fillCoherenceGaps(chunks) {
        // Simple implementation - in production, use more sophisticated gap detection
        return chunks;
    }
    estimateChunkTokens(chunk) {
        return Math.ceil(chunk.content.length / 4); // ~4 characters per token
    }
    estimateTokens(chunks) {
        return chunks.reduce((total, chunk) => total + this.estimateChunkTokens(chunk), 0);
    }
    // Conversation Summarization
    async summarizeConversation(messages, maxTokens = 1000) {
        if (messages.length === 0)
            return '';
        // Group messages into topics/themes
        const topics = this.extractConversationTopics(messages);
        // Create a concise summary focusing on key points
        const summary = topics
            .slice(0, 5) // Top 5 topics
            .map(topic => `- ${topic}`)
            .join('\n');
        return summary;
    }
    extractConversationTopics(messages) {
        // Simple keyword extraction - in production, use NLP
        const allText = messages.map(msg => msg.content).join(' ');
        const words = allText.toLowerCase().split(/\s+/);
        const wordFreq = new Map();
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
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
        ]);
        return stopWords.has(word.toLowerCase());
    }
    // Citation Management
    validateCitations(citations, chunks) {
        const validChunkIds = new Set(chunks.map(chunk => chunk.id));
        return citations.filter(citation => {
            const isValid = validChunkIds.has(citation.chunkId);
            if (!isValid) {
                logger_1.default.warn('Invalid citation found', { citation });
            }
            return isValid;
        });
    }
    enrichCitations(citations, chunks) {
        const chunkMap = new Map(chunks.map(chunk => [chunk.id, chunk]));
        return citations.map(citation => {
            const chunk = chunkMap.get(citation.chunkId);
            if (chunk) {
                return {
                    ...citation,
                    // Add additional metadata that might be useful for display
                    sectionTitle: chunk.metadata.sectionTitle,
                    sectionType: chunk.metadata.sectionType
                };
            }
            return citation;
        });
    }
    // User Focus Tracking
    updateUserFocus(currentFocus, newMessage, response) {
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
    extractConcepts(text) {
        // Simple concept extraction - in production, use NLP
        const words = text.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3 && !this.isStopWord(word));
        return [...new Set(words)].slice(0, 5);
    }
    // Performance Analytics
    getContextMetrics(contextWindow) {
        return {
            tokenEfficiency: Math.min(1.0, 1000 / contextWindow.totalTokens), // Prefer concise contexts
            relevanceCoverage: contextWindow.relevanceScores.reduce((sum, score) => sum + score, 0) / contextWindow.relevanceScores.length,
            citationQuality: contextWindow.citations.reduce((sum, citation) => sum + citation.confidence, 0) / contextWindow.citations.length
        };
    }
}
exports.ContextManager = ContextManager;
exports.contextManager = new ContextManager();
