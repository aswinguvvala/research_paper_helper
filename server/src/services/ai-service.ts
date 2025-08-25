import axios, { AxiosInstance } from 'axios';
import { OpenAI } from 'openai';
import { EmbeddingRequest, EmbeddingResponse, HealthCheckResponse, ApiError, ErrorCode } from '../types';
import config, { env } from '../config';
import logger from '../utils/logger';

export class AIService {
  private client: AxiosInstance;
  private openaiClient: OpenAI | null = null;
  private healthyStatus: boolean = false;
  private lastHealthCheck: Date = new Date(0);
  private healthCheckInterval: number = 60000; // 1 minute
  private useOpenAI: boolean = false;

  constructor() {
    // Check if OpenAI API key is available
    if (config.ai?.openai?.apiKey) {
      this.openaiClient = new OpenAI({
        apiKey: config.ai.openai.apiKey
      });
      this.useOpenAI = true;
      this.healthyStatus = true; // OpenAI service is assumed healthy
      logger.info('AI Service initialized with OpenAI embeddings');
    } else {
      // Fallback to local embedding service
      this.client = axios.create({
        baseURL: config.ai.embeddings.serviceUrl,
        timeout: env.AI_SERVICE_TIMEOUT,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Setup response interceptor for error handling
      this.client.interceptors.response.use(
        (response) => response,
        (error) => {
          logger.error('AI Service request failed', {
            url: error.config?.url,
            status: error.response?.status,
            message: error.message
          });
          throw this.handleError(error);
        }
      );

      // Start periodic health checks for local service only
      this.startHealthCheck();
      logger.warn('AI Service initialized with local embeddings (OpenAI API key not available)');
    }
  }

  private startHealthCheck(): void {
    if (!this.useOpenAI) {
      setInterval(async () => {
        try {
          await this.checkHealth();
        } catch (error) {
          logger.warn('Health check failed', { error: (error as Error).message });
        }
      }, this.healthCheckInterval);
    }
  }

  private handleError(error: any): ApiError {
    if (error.code === 'ECONNREFUSED') {
      return {
        code: ErrorCode.AI_SERVICE_ERROR,
        message: 'AI service is unavailable. Please ensure the Python service is running on port 5000.',
        timestamp: new Date(),
        details: { originalError: error.message }
      };
    }

    if (error.response) {
      return {
        code: ErrorCode.AI_SERVICE_ERROR,
        message: error.response.data?.message || 'AI service returned an error',
        timestamp: new Date(),
        details: {
          status: error.response.status,
          data: error.response.data
        }
      };
    }

    if (error.request) {
      return {
        code: ErrorCode.AI_SERVICE_ERROR,
        message: 'No response from AI service',
        timestamp: new Date(),
        details: { originalError: error.message }
      };
    }

    return {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message || 'Unknown error occurred',
      timestamp: new Date()
    };
  }

  async checkHealth(): Promise<HealthCheckResponse> {
    if (this.useOpenAI) {
      // For OpenAI, we assume it's healthy if we have an API key
      return {
        status: 'healthy',
        model_loaded: true,
        service: 'openai'
      };
    }

    try {
      const response = await this.client.get('/health');
      this.healthyStatus = response.data.status === 'healthy';
      this.lastHealthCheck = new Date();
      
      logger.info('AI service health check', {
        status: response.data.status,
        modelLoaded: response.data.model_loaded
      });

      return response.data;
    } catch (error) {
      this.healthyStatus = false;
      this.lastHealthCheck = new Date();
      throw error;
    }
  }

  async getModelInfo(): Promise<any> {
    try {
      const response = await this.client.get('/model');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Validate request
    if (!request.texts || request.texts.length === 0) {
      throw {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Texts array cannot be empty',
        timestamp: new Date()
      } as ApiError;
    }

    if (this.useOpenAI && this.openaiClient) {
      return this.generateOpenAIEmbeddings(request);
    }

    // Check if service is healthy (for local service only)
    if (!this.healthyStatus) {
      const timeSinceCheck = Date.now() - this.lastHealthCheck.getTime();
      if (timeSinceCheck > this.healthCheckInterval) {
        await this.checkHealth(); // Try to refresh health status
      }
      
      if (!this.healthyStatus) {
        throw {
          code: ErrorCode.AI_SERVICE_ERROR,
          message: 'AI service is not healthy',
          timestamp: new Date()
        } as ApiError;
      }
    }

    try {
      logger.info('Generating embeddings', {
        textCount: request.texts.length,
        totalLength: request.texts.reduce((sum, text) => sum + text.length, 0)
      });

      const response = await this.client.post('/embeddings', {
        texts: request.texts,
        normalize: request.normalize ?? true,
        batch_size: request.batch_size ?? config.ai.embeddings.batchSize
      });

      logger.info('Embeddings generated successfully', {
        count: response.data.embeddings.length,
        dimensions: response.data.dimensions,
        processingTime: response.data.processing_time
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async generateOpenAIEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    
    try {
      // Filter and validate texts
      const validTexts = request.texts
        .filter(text => text && typeof text === 'string' && text.trim().length > 0)
        .map(text => text.trim())
        .filter(text => text.length <= 8000); // OpenAI has a token limit

      if (validTexts.length === 0) {
        throw new Error('No valid texts provided for embedding generation');
      }

      logger.info('Generating OpenAI embeddings', {
        originalCount: request.texts.length,
        validCount: validTexts.length,
        totalLength: validTexts.reduce((sum, text) => sum + text.length, 0)
      });

      const response = await this.openaiClient!.embeddings.create({
        model: 'text-embedding-3-small',
        input: validTexts,
      });

      const embeddings = response.data.map(item => item.embedding);
      const processingTime = Date.now() - startTime;

      logger.info('OpenAI embeddings generated successfully', {
        count: embeddings.length,
        dimensions: embeddings[0]?.length || 0,
        processingTime
      });

      // If we filtered out some texts, pad the result with null embeddings
      const finalEmbeddings: number[][] = [];
      let validIndex = 0;
      
      for (let i = 0; i < request.texts.length; i++) {
        const originalText = request.texts[i];
        const isValid = originalText && typeof originalText === 'string' && 
                       originalText.trim().length > 0 && originalText.trim().length <= 8000;
        
        if (isValid) {
          finalEmbeddings.push(embeddings[validIndex++]);
        } else {
          // Create a zero embedding for invalid texts
          finalEmbeddings.push(new Array(1536).fill(0));
        }
      }

      return {
        embeddings: finalEmbeddings,
        dimensions: embeddings[0]?.length || 1536,
        processing_time: processingTime,
        model: 'text-embedding-3-small'
      };
    } catch (error: any) {
      logger.error('OpenAI embedding generation failed', { error: error.message });
      throw {
        code: ErrorCode.AI_SERVICE_ERROR,
        message: `OpenAI embedding generation failed: ${error.message}`,
        timestamp: new Date(),
        details: { originalError: error.message }
      } as ApiError;
    }
  }

  async computeSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    try {
      const response = await this.client.post('/similarity', {
        embedding1,
        embedding2
      });

      return response.data.similarity;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Batch processing utilities
  async generateEmbeddingsBatch(
    texts: string[], 
    batchSize: number = config.ai.embeddings.batchSize
  ): Promise<number[][]> {
    const batches = this.chunkArray(texts, batchSize);
    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const response = await this.generateEmbeddings({
        texts: batch,
        normalize: true
      });
      allEmbeddings.push(...response.embeddings);
    }

    return allEmbeddings;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Getters
  get isHealthy(): boolean {
    return this.healthyStatus;
  }

  get lastHealthCheckTime(): Date {
    return this.lastHealthCheck;
  }
}

// Singleton instance
export const aiService = new AIService();