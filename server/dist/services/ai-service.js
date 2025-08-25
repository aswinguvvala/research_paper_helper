"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = exports.AIService = void 0;
const axios_1 = __importDefault(require("axios"));
const types_1 = require("../types");
const config_1 = __importStar(require("../config"));
const logger_1 = __importDefault(require("../utils/logger"));
class AIService {
    constructor() {
        this.healthyStatus = false;
        this.lastHealthCheck = new Date(0);
        this.healthCheckInterval = 60000; // 1 minute
        this.client = axios_1.default.create({
            baseURL: config_1.default.ai.embeddings.serviceUrl,
            timeout: config_1.env.AI_SERVICE_TIMEOUT,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        // Setup response interceptor for error handling
        this.client.interceptors.response.use((response) => response, (error) => {
            logger_1.default.error('AI Service request failed', {
                url: error.config?.url,
                status: error.response?.status,
                message: error.message
            });
            throw this.handleError(error);
        });
        // Start periodic health checks
        this.startHealthCheck();
    }
    startHealthCheck() {
        setInterval(async () => {
            try {
                await this.checkHealth();
            }
            catch (error) {
                logger_1.default.warn('Health check failed', { error: error.message });
            }
        }, this.healthCheckInterval);
    }
    handleError(error) {
        if (error.code === 'ECONNREFUSED') {
            return {
                code: types_1.ErrorCode.AI_SERVICE_ERROR,
                message: 'AI service is unavailable. Please ensure the Python service is running on port 5000.',
                timestamp: new Date(),
                details: { originalError: error.message }
            };
        }
        if (error.response) {
            return {
                code: types_1.ErrorCode.AI_SERVICE_ERROR,
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
                code: types_1.ErrorCode.AI_SERVICE_ERROR,
                message: 'No response from AI service',
                timestamp: new Date(),
                details: { originalError: error.message }
            };
        }
        return {
            code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
            message: error.message || 'Unknown error occurred',
            timestamp: new Date()
        };
    }
    async checkHealth() {
        try {
            const response = await this.client.get('/health');
            this.healthyStatus = response.data.status === 'healthy';
            this.lastHealthCheck = new Date();
            logger_1.default.info('AI service health check', {
                status: response.data.status,
                modelLoaded: response.data.model_loaded
            });
            return response.data;
        }
        catch (error) {
            this.healthyStatus = false;
            this.lastHealthCheck = new Date();
            throw error;
        }
    }
    async getModelInfo() {
        try {
            const response = await this.client.get('/model');
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async generateEmbeddings(request) {
        // Validate request
        if (!request.texts || request.texts.length === 0) {
            throw {
                code: types_1.ErrorCode.VALIDATION_ERROR,
                message: 'Texts array cannot be empty',
                timestamp: new Date()
            };
        }
        // Check if service is healthy
        if (!this.healthyStatus) {
            const timeSinceCheck = Date.now() - this.lastHealthCheck.getTime();
            if (timeSinceCheck > this.healthCheckInterval) {
                await this.checkHealth(); // Try to refresh health status
            }
            if (!this.healthyStatus) {
                throw {
                    code: types_1.ErrorCode.AI_SERVICE_ERROR,
                    message: 'AI service is not healthy',
                    timestamp: new Date()
                };
            }
        }
        try {
            logger_1.default.info('Generating embeddings', {
                textCount: request.texts.length,
                totalLength: request.texts.reduce((sum, text) => sum + text.length, 0)
            });
            const response = await this.client.post('/embeddings', {
                texts: request.texts,
                normalize: request.normalize ?? true,
                batch_size: request.batch_size ?? config_1.default.ai.embeddings.batchSize
            });
            logger_1.default.info('Embeddings generated successfully', {
                count: response.data.embeddings.length,
                dimensions: response.data.dimensions,
                processingTime: response.data.processing_time
            });
            return response.data;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async computeSimilarity(embedding1, embedding2) {
        try {
            const response = await this.client.post('/similarity', {
                embedding1,
                embedding2
            });
            return response.data.similarity;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    // Batch processing utilities
    async generateEmbeddingsBatch(texts, batchSize = config_1.default.ai.embeddings.batchSize) {
        const batches = this.chunkArray(texts, batchSize);
        const allEmbeddings = [];
        for (const batch of batches) {
            const response = await this.generateEmbeddings({
                texts: batch,
                normalize: true
            });
            allEmbeddings.push(...response.embeddings);
        }
        return allEmbeddings;
    }
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
    // Getters
    get isHealthy() {
        return this.healthyStatus;
    }
    get lastHealthCheckTime() {
        return this.lastHealthCheck;
    }
}
exports.AIService = AIService;
// Singleton instance
exports.aiService = new AIService();
