import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { ChatRequest, EducationLevel, ErrorCode } from '../types';
import { createApiError } from '../types';
import { chatService, EnhancedChatOptions } from '../services/chat-service';
import logger from '../utils/logger';

const router = Router();

// Validation middleware
const validateChatRequest = [
  body('documentId').isString().notEmpty().withMessage('Document ID is required'),
  body('sessionId').isString().notEmpty().withMessage('Session ID is required'),
  body('message').isString().isLength({ min: 1, max: 5000 }).withMessage('Message must be 1-5000 characters'),
  body('educationLevel').isIn(Object.values(EducationLevel)).withMessage('Invalid education level'),
  body('highlightedText').optional().isString(),
  body('context').optional().isArray(),
];

const validateSessionId = [
  param('sessionId').isString().notEmpty().withMessage('Session ID is required')
];

// POST /api/chat - Enhanced chat with adaptive explanations
router.post('/', validateChatRequest, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid request data',
          details: errors.array()
        }
      });
    }

    const chatRequest: ChatRequest = {
      documentId: req.body.documentId,
      sessionId: req.body.sessionId,
      message: req.body.message,
      educationLevel: req.body.educationLevel,
      highlightedText: req.body.highlightedText,
      context: req.body.context
    };

    const options: EnhancedChatOptions = {
      useWorkflow: req.body.useWorkflow !== false, // Default to true
      searchStrategy: req.body.searchStrategy || 'contextual',
      maxContextTokens: req.body.maxContextTokens || 8000,
      enableContextOptimization: req.body.enableContextOptimization !== false,
      trackUserFocus: req.body.trackUserFocus !== false
    };

    logger.info('Processing enhanced chat request', {
      documentId: chatRequest.documentId,
      sessionId: chatRequest.sessionId,
      messageLength: chatRequest.message.length,
      educationLevel: chatRequest.educationLevel,
      useWorkflow: options.useWorkflow
    });

    const response = await chatService.processChat(chatRequest, options);

    res.json(response);

  } catch (error) {
    logger.error('Chat endpoint error', { error, body: req.body });
    
    if (error.code) {
      res.status(error.code === ErrorCode.VALIDATION_ERROR ? 400 : 500).json({
        error: {
          code: error.code,
          message: error.message,
          timestamp: new Date()
        }
      });
    } else {
      res.status(500).json({
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          timestamp: new Date()
        }
      });
    }
  }
});

// POST /api/chat/study-guide - Generate study guide for document
router.post('/study-guide', [
  body('documentId').isString().notEmpty().withMessage('Document ID is required'),
  body('educationLevel').isIn(Object.values(EducationLevel)).withMessage('Invalid education level'),
  body('topics').optional().isArray()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid request data',
          details: errors.array()
        }
      });
    }

    const { documentId, educationLevel, topics } = req.body;

    logger.info('Generating study guide', { documentId, educationLevel });

    const studyGuide = await chatService.generateStudyGuide(
      documentId,
      educationLevel,
      topics
    );

    res.json({
      documentId,
      educationLevel,
      studyGuide,
      generatedAt: new Date()
    });

  } catch (error) {
    logger.error('Study guide generation error', { error, body: req.body });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to generate study guide',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/chat/:sessionId/summary - Get conversation summary
router.get('/:sessionId/summary', validateSessionId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid session ID',
          details: errors.array()
        }
      });
    }

    const { sessionId } = req.params;

    logger.info('Getting conversation summary', { sessionId });

    const summary = await chatService.getConversationSummary(sessionId);

    res.json({
      sessionId,
      summary,
      generatedAt: new Date()
    });

  } catch (error) {
    logger.error('Conversation summary error', { error, sessionId: req.params.sessionId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to get conversation summary',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/chat/:sessionId/analytics - Get session analytics
router.get('/:sessionId/analytics', validateSessionId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid session ID',
          details: errors.array()
        }
      });
    }

    const { sessionId } = req.params;

    logger.info('Getting session analytics', { sessionId });

    const analytics = await chatService.getSessionAnalytics(sessionId);

    res.json({
      sessionId,
      analytics,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Session analytics error', { error, sessionId: req.params.sessionId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to get session analytics',
        timestamp: new Date()
      }
    });
  }
});

// POST /api/chat/cleanup - Cleanup expired sessions (admin endpoint)
router.post('/cleanup', [
  body('maxAgeHours').optional().isNumeric().withMessage('Max age must be a number')
], async (req: Request, res: Response) => {
  try {
    const { maxAgeHours = 24 } = req.body;

    logger.info('Cleaning up expired sessions', { maxAgeHours });

    const deletedCount = await chatService.cleanupExpiredSessions(maxAgeHours);

    res.json({
      deletedSessions: deletedCount,
      maxAgeHours,
      cleanedAt: new Date()
    });

  } catch (error) {
    logger.error('Session cleanup error', { error });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to cleanup sessions',
        timestamp: new Date()
      }
    });
  }
});

export default router;