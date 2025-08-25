import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { RetrievalQAChain, StuffDocumentsChain } from 'langchain/chains';
import { Document } from '@langchain/core/documents';
import { PromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';

import {
  ChatRequest,
  ChatResponse,
  EducationLevel,
  DocumentChunk,
  Citation,
  ChatMessage,
  MessageRole
} from '../../types';
import { vectorStore, VectorSearchResult, SearchStrategy } from '../document/vector-store';
import { generateId } from '../../types';
import config from '../../config';
import logger from '../../utils/logger';

export interface RAGContext {
  documentId: string;
  sessionId: string;
  educationLevel: EducationLevel;
  conversationHistory: ChatMessage[];
  highlightedText?: string;
}

export interface RAGResponse {
  answer: string;
  citations: Citation[];
  confidence: number;
  suggestedQuestions: string[];
  contextUsed: DocumentChunk[];
  tokensUsed: number;
  processingTime: number;
}

export class CustomVectorRetriever extends VectorStoreRetriever {
  constructor(
    private documentId: string,
    private searchOptions: { strategy: SearchStrategy; limit: number; threshold: number }
  ) {
    super();
  }

  async getRelevantDocuments(query: string): Promise<Document[]> {
    const results = await vectorStore.advancedSearch(
      query,
      this.documentId,
      {
        strategy: this.searchOptions.strategy,
        limit: this.searchOptions.limit,
        similarityThreshold: this.searchOptions.threshold
      }
    );

    return results.map(result => new Document({
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

export class ConversationMemory extends BaseChatMessageHistory {
  private messages: BaseMessage[] = [];

  constructor(private conversationHistory: ChatMessage[] = []) {
    super();
    this.loadFromHistory();
  }

  private loadFromHistory(): void {
    this.messages = this.conversationHistory.map(msg => {
      switch (msg.role) {
        case MessageRole.USER:
          return new HumanMessage(msg.content);
        case MessageRole.ASSISTANT:
          return new AIMessage(msg.content);
        default:
          return new HumanMessage(msg.content); // Default to user message
      }
    });
  }

  async getMessages(): Promise<BaseMessage[]> {
    return this.messages;
  }

  async addMessage(message: BaseMessage): Promise<void> {
    this.messages.push(message);
    
    // Keep conversation memory manageable (last 20 messages)
    if (this.messages.length > 20) {
      this.messages = this.messages.slice(-20);
    }
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}

export class RAGService {
  private llm: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private educationPrompts: Map<EducationLevel, PromptTemplate>;

  constructor() {
    if (!config.ai?.openai?.apiKey) {
      logger.warn('OpenAI API key not configured. RAG service will have limited functionality.');
      // Create dummy instances that will throw errors when used
      this.llm = null as any;
      this.embeddings = null as any;
    } else {
      this.llm = new ChatOpenAI({
        modelName: config.ai.openai.model,
        temperature: config.ai.langchain.temperature,
        maxTokens: config.ai.langchain.maxTokens,
        openAIApiKey: config.ai.openai.apiKey,
      });

      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: config.ai.openai.apiKey,
      });
    }

    this.educationPrompts = new Map();
    this.initializeEducationPrompts();
  }

  private initializeEducationPrompts(): void {
    // High School Level
    this.educationPrompts.set(EducationLevel.HIGH_SCHOOL, new PromptTemplate({
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
    this.educationPrompts.set(EducationLevel.UNDERGRADUATE, new PromptTemplate({
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
    this.educationPrompts.set(EducationLevel.MASTERS, new PromptTemplate({
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
    this.educationPrompts.set(EducationLevel.PHD, new PromptTemplate({
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
    this.educationPrompts.set(EducationLevel.NO_TECHNICAL, new PromptTemplate({
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

  async processQuery(request: ChatRequest, context: RAGContext): Promise<RAGResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing RAG query', {
        sessionId: context.sessionId,
        documentId: context.documentId,
        educationLevel: context.educationLevel,
        query: request.message.substring(0, 100)
      });

      // Step 1: Retrieve relevant context
      const relevantChunks = await this.retrieveRelevantContext(
        request.message,
        context.documentId,
        context.highlightedText
      );

      // Step 2: Format context for the prompt
      const formattedContext = this.formatContextForPrompt(relevantChunks);

      // Step 3: Prepare conversation history
      const chatHistory = this.formatChatHistory(context.conversationHistory);

      // Step 4: Get education-specific prompt
      const promptTemplate = this.educationPrompts.get(context.educationLevel) 
        || this.educationPrompts.get(EducationLevel.UNDERGRADUATE)!;

      // Step 5: Generate response using LangChain
      const answer = await this.generateAnswer(
        promptTemplate,
        formattedContext,
        chatHistory,
        request.message
      );

      // Step 6: Extract citations
      const citations = this.extractCitations(relevantChunks);

      // Step 7: Generate suggested questions
      const suggestedQuestions = await this.generateSuggestedQuestions(
        request.message,
        answer,
        context.educationLevel
      );

      const processingTime = Date.now() - startTime;

      const response: RAGResponse = {
        answer,
        citations,
        confidence: this.calculateConfidence(relevantChunks, answer),
        suggestedQuestions,
        contextUsed: relevantChunks.map(result => result.chunk),
        tokensUsed: this.estimateTokenUsage(formattedContext + answer),
        processingTime
      };

      logger.info('RAG query processed successfully', {
        sessionId: context.sessionId,
        processingTime,
        contextChunks: relevantChunks.length,
        tokensUsed: response.tokensUsed
      });

      return response;

    } catch (error) {
      logger.error('RAG query processing failed', {
        error,
        sessionId: context.sessionId,
        documentId: context.documentId
      });
      throw error;
    }
  }

  private async retrieveRelevantContext(
    query: string,
    documentId: string,
    highlightedText?: string
  ): Promise<VectorSearchResult[]> {
    const searchOptions = {
      strategy: SearchStrategy.CONTEXTUAL,
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

    return await vectorStore.advancedSearch(searchQuery, documentId, searchOptions);
  }

  private formatContextForPrompt(relevantChunks: VectorSearchResult[]): string {
    return relevantChunks
      .map((result, index) => {
        const chunk = result.chunk;
        return `[${index + 1}] Section: ${chunk.metadata.sectionTitle || 'Unknown'} (Page ${chunk.metadata.pageNumber})
Content: ${chunk.content}

`;
      })
      .join('');
  }

  private formatChatHistory(history: ChatMessage[]): string {
    if (!history || history.length === 0) return 'No previous conversation.';

    return history
      .slice(-6) // Last 6 messages for context
      .map(msg => `${msg.role === MessageRole.USER ? 'Human' : 'Assistant'}: ${msg.content}`)
      .join('\n');
  }

  private async generateAnswer(
    promptTemplate: PromptTemplate,
    context: string,
    chatHistory: string,
    question: string
  ): Promise<string> {
    const prompt = await promptTemplate.format({
      context,
      chat_history: chatHistory,
      question
    });

    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }

  private extractCitations(relevantChunks: VectorSearchResult[]): Citation[] {
    return relevantChunks.map(result => ({
      chunkId: result.chunk.id,
      pageNumber: result.chunk.metadata.pageNumber,
      confidence: Math.min(result.similarity, 0.95), // Cap confidence at 95%
      relevanceScore: result.relevanceScore || result.similarity
    }));
  }

  private async generateSuggestedQuestions(
    originalQuery: string,
    answer: string,
    educationLevel: EducationLevel
  ): Promise<string[]> {
    try {
      const suggestionPrompt = `Based on this conversation about a research paper, suggest 3 follow-up questions that would help deepen understanding at the ${educationLevel} level:

Original question: ${originalQuery}
Answer provided: ${answer.substring(0, 500)}...

Generate 3 specific, engaging follow-up questions:
1.
2.
3.`;

      const response = await this.llm.invoke(suggestionPrompt);
      const suggestions = (response.content as string)
        .split('\n')
        .filter(line => line.match(/^\d+\./))
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 3);

      return suggestions;
    } catch (error) {
      logger.warn('Failed to generate suggested questions', { error });
      return [
        'Can you explain this in more detail?',
        'What are the practical implications of this finding?',
        'How does this relate to other research in the field?'
      ];
    }
  }

  private calculateConfidence(relevantChunks: VectorSearchResult[], answer: string): number {
    if (relevantChunks.length === 0) return 0.1;

    // Base confidence on similarity scores and number of relevant chunks
    const avgSimilarity = relevantChunks.reduce((sum, result) => sum + result.similarity, 0) / relevantChunks.length;
    const chunkCount = Math.min(relevantChunks.length / 5, 1); // Normalize to max of 5 chunks
    const answerLength = Math.min(answer.length / 1000, 1); // Longer answers might be more confident

    return Math.min(0.95, avgSimilarity * 0.6 + chunkCount * 0.3 + answerLength * 0.1);
  }

  private estimateTokenUsage(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  // Advanced context optimization
  async optimizeContextForEducationLevel(
    chunks: VectorSearchResult[],
    educationLevel: EducationLevel
  ): Promise<VectorSearchResult[]> {
    // Adjust context based on education level
    switch (educationLevel) {
      case EducationLevel.HIGH_SCHOOL:
      case EducationLevel.NO_TECHNICAL:
        // Prefer introduction, conclusion, and discussion sections
        return this.reorderByEducationRelevance(chunks, ['introduction', 'conclusion', 'discussion']);
      
      case EducationLevel.UNDERGRADUATE:
        // Balanced approach with methodology included
        return this.reorderByEducationRelevance(chunks, ['introduction', 'methodology', 'results', 'discussion']);
      
      case EducationLevel.MASTERS:
      case EducationLevel.PHD:
        // Include all sections with emphasis on methodology and results
        return this.reorderByEducationRelevance(chunks, ['methodology', 'results', 'discussion', 'introduction']);
      
      default:
        return chunks;
    }
  }

  private reorderByEducationRelevance(
    chunks: VectorSearchResult[],
    preferredSections: string[]
  ): VectorSearchResult[] {
    return chunks.sort((a, b) => {
      const aIndex = preferredSections.indexOf(a.chunk.metadata.sectionType);
      const bIndex = preferredSections.indexOf(b.chunk.metadata.sectionType);
      
      // If both sections are in preferred list, sort by preference
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      
      // Prefer chunks in preferred sections
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (aIndex === -1 && bIndex !== -1) return 1;
      
      // If neither is preferred, sort by similarity
      return b.similarity - a.similarity;
    });
  }

  // Performance monitoring
  async getPerformanceMetrics(documentId: string): Promise<{
    avgResponseTime: number;
    avgTokenUsage: number;
    avgConfidence: number;
    totalQueries: number;
  }> {
    // This would be implemented with proper analytics tracking
    return {
      avgResponseTime: 0,
      avgTokenUsage: 0,
      avgConfidence: 0,
      totalQueries: 0
    };
  }
}

export const ragService = new RAGService();