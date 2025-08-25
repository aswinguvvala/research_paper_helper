"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const config = {
    server: {
        port: parseInt(process.env.PORT || '8000', 10),
        host: process.env.HOST || 'localhost',
        cors: {
            origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
            credentials: process.env.CORS_CREDENTIALS === 'true'
        },
        rateLimit: {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
            maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
        }
    },
    ai: {
        openai: {
            apiKey: process.env.OPENAI_API_KEY || '',
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000', 10),
            temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
        },
        embeddings: {
            serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5000',
            model: 'all-MiniLM-L6-v2',
            dimensions: 384,
            batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '32', 10)
        },
        langchain: {
            temperature: parseFloat(process.env.LANGCHAIN_TEMPERATURE || '0.7'),
            maxTokens: parseInt(process.env.LANGCHAIN_MAX_TOKENS || '4000', 10),
            topP: parseFloat(process.env.LANGCHAIN_TOP_P || '1.0')
        }
    },
    database: {
        type: 'sqlite',
        url: process.env.DATABASE_URL || './data/research_assistant.sqlite'
    },
    features: {
        enableAdvancedWorkflows: process.env.ENABLE_ADVANCED_WORKFLOWS === 'true',
        enableCaching: process.env.ENABLE_CACHING !== 'false',
        enableMetrics: process.env.ENABLE_METRICS === 'true',
        maxDocumentSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
        maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '50', 10)
    }
};
// Validation
if (!config.ai.openai.apiKey) {
    console.warn('⚠️  OPENAI_API_KEY not set. OpenAI features will not work.');
}
// Additional environment variables
exports.env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FILE: process.env.LOG_FILE || './logs/server.log',
    UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
    AI_SERVICE_TIMEOUT: parseInt(process.env.AI_SERVICE_TIMEOUT || '30000', 10),
    ENABLE_DB_LOGGING: process.env.ENABLE_DB_LOGGING === 'true',
    ENABLE_DEBUG_ROUTES: process.env.ENABLE_DEBUG_ROUTES === 'true'
};
exports.default = config;
