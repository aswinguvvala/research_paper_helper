"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const multer_1 = __importDefault(require("multer"));
const types_1 = require("../types");
const document_service_1 = require("../services/document/document-service");
const workflow_service_1 = require("../services/langgraph/workflow-service");
const vector_store_1 = require("../services/document/vector-store");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});
// Validation middleware
const validateDocumentId = [
    (0, express_validator_1.param)('documentId').isString().notEmpty().withMessage('Document ID is required')
];
const validateSearchRequest = [
    (0, express_validator_1.body)('query').isString().isLength({ min: 1, max: 1000 }).withMessage('Query must be 1-1000 characters'),
    (0, express_validator_1.body)('documentId').isString().notEmpty().withMessage('Document ID is required'),
    (0, express_validator_1.body)('filters').optional().isObject(),
    (0, express_validator_1.body)('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
    (0, express_validator_1.body)('similarityThreshold').optional().isFloat({ min: 0, max: 1 }).withMessage('Similarity threshold must be 0-1')
];
// POST /api/documents/upload - Enhanced document upload with advanced processing
router.post('/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'No file uploaded',
                    timestamp: new Date()
                }
            });
        }
        const processingOptions = {
            chunkSize: parseInt(req.body.chunkSize) || 1000,
            chunkOverlap: parseInt(req.body.chunkOverlap) || 200,
            preserveStructure: req.body.preserveStructure !== 'false',
            extractMetadata: req.body.extractMetadata !== 'false',
            generateEmbeddings: req.body.generateEmbeddings !== 'false'
        };
        logger_1.default.info('Enhanced document upload started', {
            filename: req.file.originalname,
            size: req.file.size,
            options: processingOptions
        });
        const response = await document_service_1.documentService.uploadDocument(req.file, processingOptions);
        res.json({
            ...response,
            uploadedAt: new Date(),
            processingOptions
        });
    }
    catch (error) {
        logger_1.default.error('Document upload error', { error, filename: req.file?.originalname });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.PROCESSING_FAILED,
                message: error.message || 'Upload failed',
                timestamp: new Date()
            }
        });
    }
});
// GET /api/documents/:documentId - Get document with enhanced metadata
router.get('/:documentId', validateDocumentId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid document ID',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        const includeStructure = req.query.includeStructure === 'true';
        const document = await document_service_1.documentService.getDocument(documentId);
        if (!document) {
            return res.status(404).json({
                error: {
                    code: types_1.ErrorCode.DOCUMENT_NOT_FOUND,
                    message: 'Document not found',
                    timestamp: new Date()
                }
            });
        }
        let response = { document };
        if (includeStructure) {
            try {
                const structure = await document_service_1.documentService.getDocumentStructure(documentId);
                response.structure = structure;
            }
            catch (error) {
                logger_1.default.warn('Failed to get document structure', { error, documentId });
            }
        }
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get document error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to retrieve document',
                timestamp: new Date()
            }
        });
    }
});
// POST /api/documents/:documentId/search - Advanced document search
router.post('/:documentId/search', [
    ...validateDocumentId,
    (0, express_validator_1.body)('query').isString().isLength({ min: 1, max: 1000 }).withMessage('Query must be 1-1000 characters'),
    (0, express_validator_1.body)('strategy').optional().isIn(['semantic', 'hybrid', 'contextual']).withMessage('Invalid search strategy'),
    (0, express_validator_1.body)('educationLevel').optional().isString(),
    (0, express_validator_1.body)('filters').optional().isObject(),
    (0, express_validator_1.body)('boostFactors').optional().isObject()
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid search request',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        const searchRequest = {
            query: req.body.query,
            documentId,
            strategy: req.body.strategy || 'hybrid',
            educationLevel: req.body.educationLevel,
            filters: req.body.filters || {},
            limit: req.body.limit || 10,
            similarityThreshold: req.body.similarityThreshold || 0.7,
            boostFactors: req.body.boostFactors
        };
        logger_1.default.info('Advanced document search', {
            documentId,
            query: req.body.query.substring(0, 100),
            strategy: searchRequest.strategy
        });
        const response = await document_service_1.documentService.advancedSearchDocument(searchRequest);
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Document search error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Search failed',
                timestamp: new Date()
            }
        });
    }
});
// POST /api/documents/:documentId/analyze - Research analysis workflows
router.post('/:documentId/analyze', [
    ...validateDocumentId,
    (0, express_validator_1.body)('analysisType').isIn(['methodology', 'findings', 'critique', 'implications']).withMessage('Invalid analysis type'),
    (0, express_validator_1.body)('educationLevel').optional().isString()
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid analysis request',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        const { analysisType, educationLevel = 'undergraduate' } = req.body;
        logger_1.default.info('Starting research analysis', { documentId, analysisType, educationLevel });
        const analysisResult = await workflow_service_1.workflowService.processResearchAnalysis(documentId, analysisType, educationLevel);
        res.json({
            documentId,
            analysisType,
            educationLevel,
            result: analysisResult,
            analyzedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Research analysis error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Analysis failed',
                timestamp: new Date()
            }
        });
    }
});
// GET /api/documents/:documentId/structure - Get document structure
router.get('/:documentId/structure', validateDocumentId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid document ID',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        logger_1.default.info('Getting document structure', { documentId });
        const structure = await document_service_1.documentService.getDocumentStructure(documentId);
        res.json({
            documentId,
            structure,
            retrievedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Get document structure error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to get document structure',
                timestamp: new Date()
            }
        });
    }
});
// GET /api/documents/:documentId/stats - Enhanced document statistics
router.get('/:documentId/stats', validateDocumentId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid document ID',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        logger_1.default.info('Getting enhanced document stats', { documentId });
        const stats = await document_service_1.documentService.getDocumentStats(documentId);
        const vectorStats = await vector_store_1.vectorStore.getDocumentStats(documentId);
        res.json({
            documentId,
            basicStats: stats,
            vectorStats,
            retrievedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Get document stats error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to get document statistics',
                timestamp: new Date()
            }
        });
    }
});
// POST /api/documents/:documentId/cache/warmup - Warm up vector cache
router.post('/:documentId/cache/warmup', validateDocumentId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid document ID',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        logger_1.default.info('Warming up vector cache', { documentId });
        await vector_store_1.vectorStore.warmupVectorCache(documentId);
        res.json({
            documentId,
            status: 'cache warmed up',
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Cache warmup error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to warm up cache',
                timestamp: new Date()
            }
        });
    }
});
// GET /api/documents - List documents with pagination
router.get('/', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid pagination parameters',
                    details: errors.array()
                }
            });
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const result = await document_service_1.documentService.listDocuments(page, limit);
        res.json(result);
    }
    catch (error) {
        logger_1.default.error('List documents error', { error });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to list documents',
                timestamp: new Date()
            }
        });
    }
});
// GET /api/documents/:documentId/processing-status - Get processing status
router.get('/:documentId/processing-status', validateDocumentId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid document ID',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        const status = await document_service_1.documentService.getProcessingStatus(documentId);
        res.json({
            documentId,
            processingStatus: status,
            checkedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Get processing status error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to get processing status',
                timestamp: new Date()
            }
        });
    }
});
// DELETE /api/documents/:documentId - Delete document and all associated data
router.delete('/:documentId', validateDocumentId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid document ID',
                    details: errors.array()
                }
            });
        }
        const { documentId } = req.params;
        logger_1.default.info('Deleting document', { documentId });
        await document_service_1.documentService.deleteDocument(documentId);
        res.json({
            documentId,
            status: 'deleted',
            deletedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Delete document error', { error, documentId: req.params.documentId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to delete document',
                timestamp: new Date()
            }
        });
    }
});
exports.default = router;
