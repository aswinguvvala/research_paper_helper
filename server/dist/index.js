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
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const config_1 = __importStar(require("./config"));
const connection_1 = require("./database/connection");
const ai_service_1 = require("./services/ai-service");
const logger_1 = __importDefault(require("./utils/logger"));
// Import middleware
const middleware_1 = require("./middleware");
// Import routes
const routes_1 = __importDefault(require("./routes"));
class Server {
    constructor() {
        this.isShuttingDown = false;
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    setupMiddleware() {
        // Security and utility middleware
        this.app.use(middleware_1.requestId);
        this.app.use(middleware_1.securityMiddleware);
        this.app.use(middleware_1.corsMiddleware);
        this.app.use(middleware_1.compressionMiddleware);
        // Logging
        this.app.use(middleware_1.loggingMiddleware);
        // Rate limiting
        this.app.use(middleware_1.rateLimitMiddleware);
        // Body parsing
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    }
    setupRoutes() {
        // Mount comprehensive API routes
        this.app.use('/api', routes_1.default);
        // Root endpoint with enhanced API information
        this.app.get('/', (req, res) => {
            res.json({
                name: 'Research Paper Assistant API',
                version: '2.0.0',
                status: 'running',
                description: 'Advanced AI-powered research paper analysis with LangChain and LangGraph',
                timestamp: new Date().toISOString(),
                features: [
                    'Intelligent PDF processing with hierarchical structure detection',
                    'Semantic chunking and advanced vector search',
                    'Education-level adaptive explanations',
                    'LangGraph workflows for research analysis',
                    'Advanced context management and citation tracking',
                    'Multi-strategy search (semantic, hybrid, contextual)',
                    'Document fingerprinting and caching',
                    'Study guide generation',
                    'Conversation analytics'
                ],
                endpoints: {
                    info: 'GET /api/info - Comprehensive API documentation',
                    health: 'GET /api/health - Enhanced health check with service statistics',
                    chat: 'POST /api/chat - Enhanced chat with adaptive explanations',
                    documents: 'POST /api/documents/upload - Advanced document processing',
                    search: 'POST /api/documents/:id/search - Multi-strategy document search',
                    analysis: 'POST /api/documents/:id/analyze - Research analysis workflows'
                }
            });
        });
    }
    setupErrorHandling() {
        // 404 handler
        this.app.use(middleware_1.notFoundHandler);
        // Error handler (must be last)
        this.app.use(middleware_1.errorHandler);
    }
    async start() {
        try {
            // Initialize database
            logger_1.default.info('Initializing database...');
            await connection_1.databaseManager.initialize();
            // Check AI service health
            logger_1.default.info('Checking AI service health...');
            try {
                await ai_service_1.aiService.checkHealth();
                logger_1.default.info('AI service is healthy');
            }
            catch (error) {
                logger_1.default.warn('AI service health check failed', { error: error.message });
                logger_1.default.warn('AI-dependent features may not work properly');
            }
            // Start HTTP server
            this.server = (0, http_1.createServer)(this.app);
            this.server.listen(config_1.default.server.port, config_1.default.server.host, () => {
                logger_1.default.info('Server started', {
                    host: config_1.default.server.host,
                    port: config_1.default.server.port,
                    env: config_1.env.NODE_ENV,
                    pid: process.pid
                });
                logger_1.default.info('Service URLs:', {
                    api: `http://${config_1.default.server.host}:${config_1.default.server.port}`,
                    health: `http://${config_1.default.server.host}:${config_1.default.server.port}/api/health`,
                    aiService: config_1.default.ai.embeddings.serviceUrl
                });
            });
            // Setup graceful shutdown
            this.setupGracefulShutdown();
        }
        catch (error) {
            logger_1.default.error('Failed to start server', { error });
            process.exit(1);
        }
    }
    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            if (this.isShuttingDown)
                return;
            this.isShuttingDown = true;
            logger_1.default.info(`Received ${signal}, shutting down gracefully...`);
            // Stop accepting new requests
            this.server?.close(async () => {
                try {
                    // Close database connection
                    await connection_1.databaseManager.close();
                    logger_1.default.info('Server shutdown complete');
                    process.exit(0);
                }
                catch (error) {
                    logger_1.default.error('Error during shutdown', { error });
                    process.exit(1);
                }
            });
            // Force shutdown after 10 seconds
            setTimeout(() => {
                logger_1.default.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 10000);
        };
        // Handle different signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger_1.default.error('Uncaught Exception', { error: error.stack });
            gracefulShutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.default.error('Unhandled Rejection', { reason, promise });
            gracefulShutdown('unhandledRejection');
        });
    }
    get app() {
        return this.app;
    }
}
// Start server
const server = new Server();
server.start().catch((error) => {
    logger_1.default.error('Failed to start application', { error });
    process.exit(1);
});
exports.default = server;
