"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const types_1 = require("../types");
const chat_service_1 = require("../services/chat-service");
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// Validation middleware
const validateChatRequest = [
    (0, express_validator_1.body)('sessionId').isString().notEmpty().withMessage('Session ID is required'),
    (0, express_validator_1.body)('message').isString().isLength({ min: 1, max: 5000 }).withMessage('Message must be 1-5000 characters'),
    (0, express_validator_1.body)('educationLevel').isIn(Object.values(types_1.EducationLevel)).withMessage('Invalid education level'),
    (0, express_validator_1.body)('highlightedText').optional().isObject(),
    (0, express_validator_1.body)('context').optional().isArray(),
];
const validateSessionId = [
    (0, express_validator_1.param)('sessionId').isString().notEmpty().withMessage('Session ID is required')
];
// POST /api/chat - Enhanced chat with adaptive explanations
router.post('/', validateChatRequest, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid request data',
                    details: errors.array()
                }
            });
        }
        const chatRequest = {
            sessionId: req.body.sessionId,
            message: req.body.message,
            educationLevel: req.body.educationLevel,
            highlightedText: req.body.highlightedText,
            context: req.body.context
        };
        const options = {
            useWorkflow: req.body.useWorkflow !== false, // Default to true
            searchStrategy: req.body.searchStrategy || 'contextual',
            maxContextTokens: req.body.maxContextTokens || 8000,
            enableContextOptimization: req.body.enableContextOptimization !== false,
            trackUserFocus: req.body.trackUserFocus !== false
        };
        logger_1.default.info('Processing enhanced chat request', {
            sessionId: chatRequest.sessionId,
            messageLength: chatRequest.message.length,
            educationLevel: chatRequest.educationLevel,
            useWorkflow: options.useWorkflow
        });
        const response = await chat_service_1.chatService.processChat(chatRequest, options);
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Chat endpoint error', { error, body: req.body });
        if (error.code) {
            res.status(error.code === types_1.ErrorCode.VALIDATION_ERROR ? 400 : 500).json({
                error: {
                    code: error.code,
                    message: error.message,
                    timestamp: new Date()
                }
            });
        }
        else {
            res.status(500).json({
                error: {
                    code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                    message: 'Internal server error',
                    timestamp: new Date()
                }
            });
        }
    }
});
// POST /api/chat/study-guide - Generate study guide for document
router.post('/study-guide', [
    (0, express_validator_1.body)('documentId').isString().notEmpty().withMessage('Document ID is required'),
    (0, express_validator_1.body)('educationLevel').isIn(Object.values(types_1.EducationLevel)).withMessage('Invalid education level'),
    (0, express_validator_1.body)('topics').optional().isArray()
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid request data',
                    details: errors.array()
                }
            });
        }
        const { documentId, educationLevel, topics } = req.body;
        logger_1.default.info('Generating study guide', { documentId, educationLevel });
        const studyGuide = await chat_service_1.chatService.generateStudyGuide(documentId, educationLevel, topics);
        res.json({
            documentId,
            educationLevel,
            studyGuide,
            generatedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Study guide generation error', { error, body: req.body });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to generate study guide',
                timestamp: new Date()
            }
        });
    }
});
// GET /api/chat/:sessionId/summary - Get conversation summary
router.get('/:sessionId/summary', validateSessionId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid session ID',
                    details: errors.array()
                }
            });
        }
        const { sessionId } = req.params;
        logger_1.default.info('Getting conversation summary', { sessionId });
        const summary = await chat_service_1.chatService.getConversationSummary(sessionId);
        res.json({
            sessionId,
            summary,
            generatedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Conversation summary error', { error, sessionId: req.params.sessionId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to get conversation summary',
                timestamp: new Date()
            }
        });
    }
});
// GET /api/chat/:sessionId/analytics - Get session analytics
router.get('/:sessionId/analytics', validateSessionId, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    code: types_1.ErrorCode.VALIDATION_ERROR,
                    message: 'Invalid session ID',
                    details: errors.array()
                }
            });
        }
        const { sessionId } = req.params;
        logger_1.default.info('Getting session analytics', { sessionId });
        const analytics = await chat_service_1.chatService.getSessionAnalytics(sessionId);
        res.json({
            sessionId,
            analytics,
            timestamp: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Session analytics error', { error, sessionId: req.params.sessionId });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to get session analytics',
                timestamp: new Date()
            }
        });
    }
});
// POST /api/chat/cleanup - Cleanup expired sessions (admin endpoint)
router.post('/cleanup', [
    (0, express_validator_1.body)('maxAgeHours').optional().isNumeric().withMessage('Max age must be a number')
], async (req, res) => {
    try {
        const { maxAgeHours = 24 } = req.body;
        logger_1.default.info('Cleaning up expired sessions', { maxAgeHours });
        const deletedCount = await chat_service_1.chatService.cleanupExpiredSessions(maxAgeHours);
        res.json({
            deletedSessions: deletedCount,
            maxAgeHours,
            cleanedAt: new Date()
        });
    }
    catch (error) {
        logger_1.default.error('Session cleanup error', { error });
        res.status(500).json({
            error: {
                code: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
                message: 'Failed to cleanup sessions',
                timestamp: new Date()
            }
        });
    }
});
exports.default = router;
