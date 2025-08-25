"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ragService = exports.RAGService = exports.ConversationMemory = exports.CustomVectorRetriever = void 0;
const openai_1 = require("@langchain/openai");
const openai_2 = require("@langchain/openai");
const vectorstores_1 = require("@langchain/core/vectorstores");
const documents_1 = require("@langchain/core/documents");
const prompts_1 = require("@langchain/core/prompts");
const messages_1 = require("@langchain/core/messages");
const chat_history_1 = require("@langchain/core/chat_history");
const types_1 = require("../types");
const vector_store_1 = require("../document/vector-store");
const config_1 = __importDefault(require("../../config"));
const logger_1 = __importDefault(require("../../utils/logger"));
class CustomVectorRetriever extends vectorstores_1.VectorStoreRetriever {
    constructor(documentId, searchOptions) {
        super();
        this.documentId = documentId;
        this.searchOptions = searchOptions;
    }
    async getRelevantDocuments(query) {
        const results = await vector_store_1.vectorStore.advancedSearch(query, this.documentId, {
            strategy: this.searchOptions.strategy,
            limit: this.searchOptions.limit,
            similarityThreshold: this.searchOptions.threshold
        });
        return results.map(result => new documents_1.Document({
            pageContent: result.chunk.content,
            metadata: {
                chunkId: result.chunk.id,
                pageNumber: result.chunk.metadata.pageNumber,
                sectionTitle: result.chunk.metadata.sectionTitle,
                sectionType: result.chunk.metadata.sectionType,
                similarity: result.similarity,
                rank: result.rank,
                citations: true
            }
        }));
    }
}
exports.CustomVectorRetriever = CustomVectorRetriever;
class ConversationMemory extends chat_history_1.BaseChatMessageHistory {
    constructor(conversationHistory = []) {
        super();
        this.conversationHistory = conversationHistory;
        this.messages = [];
        this.loadFromHistory();
    }
    loadFromHistory() {
        this.messages = this.conversationHistory.map(msg => {
            switch (msg.role) {
                case types_1.MessageRole.USER:
                    return new messages_1.HumanMessage(msg.content);
                case types_1.MessageRole.ASSISTANT:
                    return new messages_1.AIMessage(msg.content);
                default:
                    return new messages_1.HumanMessage(msg.content); // Default to user message
            }
        });
    }
    async getMessages() {
        return this.messages;
    }
    async addMessage(message) {
        this.messages.push(message);
        // Keep conversation memory manageable (last 20 messages)
        if (this.messages.length > 20) {
            this.messages = this.messages.slice(-20);
        }
    }
    async clear() {
        this.messages = [];
    }
}
exports.ConversationMemory = ConversationMemory;
class RAGService {
    constructor() {
        this.llm = new openai_1.ChatOpenAI({
            modelName: config_1.default.ai.openai.model,
            temperature: config_1.default.ai.langchain.temperature,
            maxTokens: config_1.default.ai.langchain.maxTokens,
            openAIApiKey: config_1.default.ai.openai.apiKey,
        });
        this.embeddings = new openai_2.OpenAIEmbeddings({
            openAIApiKey: config_1.default.ai.openai.apiKey,
        });
        this.educationPrompts = new Map();
        this.initializeEducationPrompts();
    }
    initializeEducationPrompts() {
        // High School Level
        this.educationPrompts.set(types_1.EducationLevel.HIGH_SCHOOL, new prompts_1.PromptTemplate({
            template: `You are an AI tutor explaining research papers to high school students. Use simple language, everyday analogies, and avoid technical jargon.

Context from research paper:
{context}

Conversation history:
{chat_history}

Student question: {question}

Guidelines:
- Use simple, clear language that a high school student would understand
- Provide concrete examples and real-world analogies
- Break down complex concepts into smaller, digestible pieces
- Encourage curiosity and further questions
- If the paper discusses technical methods, explain them in terms of everyday activities

Answer:`,
            inputVariables: ['context', 'chat_history', 'question']
        }));
        // Undergraduate Level
        this.educationPrompts.set(types_1.EducationLevel.UNDERGRADUATE, new prompts_1.PromptTemplate({
            template: `You are an AI tutor helping undergraduate students understand research papers. Use college-level language and connect concepts to foundational coursework.

Context from research paper:
{context}

Conversation history:
{chat_history}

Student question: {question}

Guidelines:
- Use appropriate academic language while remaining accessible
- Connect new concepts to foundational knowledge typically covered in undergraduate courses
- Provide clear explanations of technical terms when first introduced
- Use examples from well-known studies or applications
- Encourage critical thinking about the research methods and findings

Answer:`,
            inputVariables: ['context', 'chat_history', 'question']
        }));
        // Masters Level
        this.educationPrompts.set(types_1.EducationLevel.MASTERS, new prompts_1.PromptTemplate({
            template: `You are an AI research advisor helping graduate students analyze research papers. Use advanced academic language and discuss implications for current research trends.

Context from research paper:
{context}

Conversation history:
{chat_history}

Student question: {question}

Guidelines:
- Use sophisticated academic language and technical terminology
- Discuss methodological implications and potential limitations
- Connect findings to broader research trends and current literature
- Highlight novel contributions and their significance to the field
- Encourage critical evaluation of research design and conclusions

Answer:`,
            inputVariables: ['context', 'chat_history', 'question']
        }));
        // PhD Level
        this.educationPrompts.set(types_1.EducationLevel.PHD, new prompts_1.PromptTemplate({
            template: `You are an AI research collaborator helping PhD researchers with in-depth analysis of research papers. Provide expert-level insights and methodological critiques.

Context from research paper:
{context}

Conversation history:
{chat_history}

Researcher question: {question}

Guidelines:
- Use expert-level academic language and assume deep domain knowledge
- Provide detailed methodological analysis and critique
- Discuss implications for future research directions
- Identify potential gaps, limitations, or opportunities for extension
- Reference broader theoretical frameworks and cutting-edge developments in the field

Answer:`,
            inputVariables: ['context', 'chat_history', 'question']
        }));
        // No Technical Background
        this.educationPrompts.set(types_1.EducationLevel.NO_TECHNICAL, new prompts_1.PromptTemplate({
            template: `You are an AI science communicator explaining research findings to someone without technical background. Focus on practical implications and real-world impact.

Context from research paper:
{context}

Conversation history:
{chat_history}

Question: {question}

Guidelines:
- Avoid technical jargon entirely - use plain, everyday language
- Focus on practical applications and real-world impact
- Use metaphors and analogies from daily life
- Explain the "why it matters" rather than the "how it works"
- Make the research relatable to personal experiences

Answer:`,
            inputVariables: ['context', 'chat_history', 'question']
        }));
    }
    async processQuery(request, context) {
        const startTime = Date.now();
        try {
            logger_1.default.info('Processing RAG query', {
                sessionId: context.sessionId,
                documentId: context.documentId,
                educationLevel: context.educationLevel,
                query: request.message.substring(0, 100)
            });
            // Step 1: Retrieve relevant context
            const relevantChunks = await this.retrieveRelevantContext(request.message, context.documentId, context.highlightedText);
            // Step 2: Format context for the prompt
            const formattedContext = this.formatContextForPrompt(relevantChunks);
            // Step 3: Prepare conversation history
            const chatHistory = this.formatChatHistory(context.conversationHistory);
            // Step 4: Get education-specific prompt
            const promptTemplate = this.educationPrompts.get(context.educationLevel)
                || this.educationPrompts.get(types_1.EducationLevel.UNDERGRADUATE);
            // Step 5: Generate response using LangChain
            const answer = await this.generateAnswer(promptTemplate, formattedContext, chatHistory, request.message);
            // Step 6: Extract citations
            const citations = this.extractCitations(relevantChunks);
            // Step 7: Generate suggested questions
            const suggestedQuestions = await this.generateSuggestedQuestions(request.message, answer, context.educationLevel);
            const processingTime = Date.now() - startTime;
            const response = {
                answer,
                citations,
                confidence: this.calculateConfidence(relevantChunks, answer),
                suggestedQuestions,
                contextUsed: relevantChunks.map(result => result.chunk),
                tokensUsed: this.estimateTokenUsage(formattedContext + answer),
                processingTime
            };
            logger_1.default.info('RAG query processed successfully', {
                sessionId: context.sessionId,
                processingTime,
                contextChunks: relevantChunks.length,
                tokensUsed: response.tokensUsed
            });
            return response;
        }
        catch (error) {
            logger_1.default.error('RAG query processing failed', {
                error,
                sessionId: context.sessionId,
                documentId: context.documentId
            });
            throw error;
        }
    }
    async retrieveRelevantContext(query, documentId, highlightedText) {
        const searchOptions = {
            strategy: vector_store_1.SearchStrategy.CONTEXTUAL,
            limit: 8, // Retrieve more chunks for better context
            similarityThreshold: 0.6,
            boostFactors: {
                sectionType: {
                    abstract: 1.2,
                    introduction: 1.1,
                    methodology: 1.0,
                    results: 1.1,
                    discussion: 1.1,
                    conclusion: 1.2,
                    references: 0.8,
                    figure: 0.9,
                    table: 0.9,
                    equation: 0.9,
                    title: 1.0,
                    other: 1.0
                },
                recency: 1.0,
                readability: 1.0,
                keywordMatch: 1.3
            }
        };
        // If there's highlighted text, use it to enhance the search
        const searchQuery = highlightedText
            ? `${query} ${highlightedText}`
            : query;
        return await vector_store_1.vectorStore.advancedSearch(searchQuery, documentId, searchOptions);
    }
    formatContextForPrompt(relevantChunks) {
        return relevantChunks
            .map((result, index) => {
            const chunk = result.chunk;
            return `[${index + 1}] Section: ${chunk.metadata.sectionTitle || 'Unknown'} (Page ${chunk.metadata.pageNumber})
Content: ${chunk.content}

`;
        })
            .join('');
    }
    formatChatHistory(history) {
        if (!history || history.length === 0)
            return 'No previous conversation.';
        return history
            .slice(-6) // Last 6 messages for context
            .map(msg => `${msg.role === types_1.MessageRole.USER ? 'Human' : 'Assistant'}: ${msg.content}`)
            .join('\n');
    }
    async generateAnswer(promptTemplate, context, chatHistory, question) {
        const prompt = await promptTemplate.format({
            context,
            chat_history: chatHistory,
            question
        });
        const response = await this.llm.invoke(prompt);
        return response.content;
    }
    extractCitations(relevantChunks) {
        return relevantChunks.map(result => ({
            chunkId: result.chunk.id,
            pageNumber: result.chunk.metadata.pageNumber,
            confidence: Math.min(result.similarity, 0.95), // Cap confidence at 95%
            relevanceScore: result.relevanceScore || result.similarity
        }));
    }
    async generateSuggestedQuestions(originalQuery, answer, educationLevel) {
        try {
            const suggestionPrompt = `Based on this conversation about a research paper, suggest 3 follow-up questions that would help deepen understanding at the ${educationLevel} level:

Original question: ${originalQuery}
Answer provided: ${answer.substring(0, 500)}...

Generate 3 specific, engaging follow-up questions:
1.
2.
3.`;
            const response = await this.llm.invoke(suggestionPrompt);
            const suggestions = response.content
                .split('\n')
                .filter(line => line.match(/^\d+\./))
                .map(line => line.replace(/^\d+\.\s*/, '').trim())
                .slice(0, 3);
            return suggestions;
        }
        catch (error) {
            logger_1.default.warn('Failed to generate suggested questions', { error });
            return [
                'Can you explain this in more detail?',
                'What are the practical implications of this finding?',
                'How does this relate to other research in the field?'
            ];
        }
    }
    calculateConfidence(relevantChunks, answer) {
        if (relevantChunks.length === 0)
            return 0.1;
        // Base confidence on similarity scores and number of relevant chunks
        const avgSimilarity = relevantChunks.reduce((sum, result) => sum + result.similarity, 0) / relevantChunks.length;
        const chunkCount = Math.min(relevantChunks.length / 5, 1); // Normalize to max of 5 chunks
        const answerLength = Math.min(answer.length / 1000, 1); // Longer answers might be more confident
        return Math.min(0.95, avgSimilarity * 0.6 + chunkCount * 0.3 + answerLength * 0.1);
    }
    estimateTokenUsage(text) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
    // Advanced context optimization
    async optimizeContextForEducationLevel(chunks, educationLevel) {
        // Adjust context based on education level
        switch (educationLevel) {
            case types_1.EducationLevel.HIGH_SCHOOL:
            case types_1.EducationLevel.NO_TECHNICAL:
                // Prefer introduction, conclusion, and discussion sections
                return this.reorderByEducationRelevance(chunks, ['introduction', 'conclusion', 'discussion']);
            case types_1.EducationLevel.UNDERGRADUATE:
                // Balanced approach with methodology included
                return this.reorderByEducationRelevance(chunks, ['introduction', 'methodology', 'results', 'discussion']);
            case types_1.EducationLevel.MASTERS:
            case types_1.EducationLevel.PHD:
                // Include all sections with emphasis on methodology and results
                return this.reorderByEducationRelevance(chunks, ['methodology', 'results', 'discussion', 'introduction']);
            default:
                return chunks;
        }
    }
    reorderByEducationRelevance(chunks, preferredSections) {
        return chunks.sort((a, b) => {
            const aIndex = preferredSections.indexOf(a.chunk.metadata.sectionType);
            const bIndex = preferredSections.indexOf(b.chunk.metadata.sectionType);
            // If both sections are in preferred list, sort by preference
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }
            // Prefer chunks in preferred sections
            if (aIndex !== -1 && bIndex === -1)
                return -1;
            if (aIndex === -1 && bIndex !== -1)
                return 1;
            // If neither is preferred, sort by similarity
            return b.similarity - a.similarity;
        });
    }
    // Performance monitoring
    async getPerformanceMetrics(documentId) {
        // This would be implemented with proper analytics tracking
        return {
            avgResponseTime: 0,
            avgTokenUsage: 0,
            avgConfidence: 0,
            totalQueries: 0
        };
    }
}
exports.RAGService = RAGService;
exports.ragService = new RAGService();
