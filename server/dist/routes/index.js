"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_routes_1 = __importDefault(require("./chat-routes"));
const document_routes_1 = __importDefault(require("./document-routes"));
const document_service_1 = require("../services/document/document-service");
const connection_1 = require("../database/connection");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Mount route modules
router.use('/chat', chat_routes_1.default);
router.use('/documents', document_routes_1.default);
// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        const dbHealth = await connection_1.databaseManager.healthCheck();
        const documentHealth = await document_service_1.documentService.healthCheck();
        const overallStatus = dbHealth && documentHealth.status === 'healthy' ? 'healthy' : 'unhealthy';
        const health = {
            status: overallStatus,
            timestamp: new Date(),
            services: {
                database: dbHealth ? 'healthy' : 'unhealthy',
                documents: documentHealth.status,
                api: 'healthy'
            },
            stats: {
                documentsCount: documentHealth.documentsCount,
                chunksCount: documentHealth.chunksCount,
                processingJobs: documentHealth.processingJobs
            }
        };
        const statusCode = overallStatus === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    }
    catch (error) {
        logger_1.default.error('Health check failed', { error });
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date(),
            error: 'Health check failed'
        });
    }
});
// API info endpoint
router.get('/info', (req, res) => {
    res.json({
        name: 'Research Paper Assistant API',
        version: '2.0.0',
        description: 'Advanced AI-powered research paper analysis with LangChain and LangGraph',
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
            chat: {
                'POST /api/chat': 'Enhanced chat with adaptive explanations',
                'POST /api/chat/study-guide': 'Generate study guide for document',
                'GET /api/chat/:sessionId/summary': 'Get conversation summary',
                'GET /api/chat/:sessionId/analytics': 'Get session analytics',
                'POST /api/chat/cleanup': 'Cleanup expired sessions (admin)'
            },
            documents: {
                'POST /api/documents/upload': 'Enhanced document upload with advanced processing',
                'GET /api/documents': 'List documents with pagination',
                'GET /api/documents/:documentId': 'Get document with enhanced metadata',
                'POST /api/documents/:documentId/search': 'Advanced document search',
                'POST /api/documents/:documentId/analyze': 'Research analysis workflows',
                'GET /api/documents/:documentId/structure': 'Get document structure',
                'GET /api/documents/:documentId/stats': 'Enhanced document statistics',
                'GET /api/documents/:documentId/processing-status': 'Get processing status',
                'POST /api/documents/:documentId/cache/warmup': 'Warm up vector cache',
                'DELETE /api/documents/:documentId': 'Delete document'
            },
            system: {
                'GET /api/health': 'Health check endpoint',
                'GET /api/info': 'API information'
            }
        },
        supportedFileTypes: ['application/pdf'],
        educationLevels: ['high_school', 'no_technical', 'undergraduate', 'masters', 'phd'],
        searchStrategies: ['semantic', 'hybrid', 'contextual'],
        analysisTypes: ['methodology', 'findings', 'critique', 'implications']
    });
});
// Catch-all for undefined routes
router.use('*', (req, res) => {
    res.status(404).json({
        error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${req.method} ${req.originalUrl} not found`,
            timestamp: new Date()
        }
    });
});
exports.default = router;
