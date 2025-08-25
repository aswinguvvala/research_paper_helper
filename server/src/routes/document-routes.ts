import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ErrorCode, SectionType } from '../types';
import { documentService } from '../services/document/document-service';
import { workflowService } from '../services/langgraph/workflow-service';
import { vectorStore } from '../services/document/vector-store';
import { env } from '../config';
import logger from '../utils/logger';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Validation middleware
const validateDocumentId = [
  param('documentId').isString().notEmpty().withMessage('Document ID is required')
];

const validateSearchRequest = [
  body('query').isString().isLength({ min: 1, max: 1000 }).withMessage('Query must be 1-1000 characters'),
  body('documentId').isString().notEmpty().withMessage('Document ID is required'),
  body('filters').optional().isObject(),
  body('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  body('similarityThreshold').optional().isFloat({ min: 0, max: 1 }).withMessage('Similarity threshold must be 0-1')
];

// POST /api/documents/upload - Enhanced document upload with advanced processing
router.post('/upload', upload.single('document'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
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

    logger.info('Enhanced document upload started', {
      filename: req.file.originalname,
      size: req.file.size,
      options: processingOptions
    });

    const response = await documentService.uploadDocument(req.file, processingOptions);

    res.json({
      ...response,
      uploadedAt: new Date(),
      processingOptions
    });

  } catch (error) {
    logger.error('Document upload error', { error, filename: req.file?.originalname });
    
    res.status(500).json({
      error: {
        code: ErrorCode.PROCESSING_FAILED,
        message: error.message || 'Upload failed',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents/:documentId/pdf - Serve PDF file
router.get('/:documentId/pdf', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;
    
    // First check if document exists
    const document = await documentService.getDocument(documentId);
    if (!document) {
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND,
          message: 'Document not found',
          timestamp: new Date()
        }
      });
    }

    // Construct file path
    const uploadDir = path.resolve(env.UPLOAD_DIR || './uploads');
    const filePath = path.join(uploadDir, `${documentId}.pdf`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.error('PDF file not found on disk', { documentId, filePath });
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND,
          message: 'PDF file not found',
          timestamp: new Date()
        }
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
    
    // Stream the PDF file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    logger.info('PDF file served', { documentId, filename: document.filename });

  } catch (error) {
    logger.error('PDF serving error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to serve PDF',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents/:documentId - Get document with enhanced metadata
router.get('/:documentId', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;
    const includeStructure = req.query.includeStructure === 'true';

    const document = await documentService.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND,
          message: 'Document not found',
          timestamp: new Date()
        }
      });
    }

    let response: any = { document };

    if (includeStructure) {
      try {
        const structure = await documentService.getDocumentStructure(documentId);
        response.structure = structure;
      } catch (error) {
        logger.warn('Failed to get document structure', { error, documentId });
      }
    }

    res.json(response);

  } catch (error) {
    logger.error('Get document error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve document',
        timestamp: new Date()
      }
    });
  }
});

// POST /api/documents/:documentId/search - Advanced document search
router.post('/:documentId/search', [
  ...validateDocumentId,
  body('query').isString().isLength({ min: 1, max: 1000 }).withMessage('Query must be 1-1000 characters'),
  body('strategy').optional().isIn(['semantic', 'hybrid', 'contextual']).withMessage('Invalid search strategy'),
  body('educationLevel').optional().isString(),
  body('filters').optional().isObject(),
  body('boostFactors').optional().isObject()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
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

    logger.info('Advanced document search', {
      documentId,
      query: req.body.query.substring(0, 100),
      strategy: searchRequest.strategy
    });

    const response = await documentService.advancedSearchDocument(searchRequest);

    res.json(response);

  } catch (error) {
    logger.error('Document search error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Search failed',
        timestamp: new Date()
      }
    });
  }
});

// POST /api/documents/:documentId/analyze - Research analysis workflows
router.post('/:documentId/analyze', [
  ...validateDocumentId,
  body('analysisType').isIn(['methodology', 'findings', 'critique', 'implications']).withMessage('Invalid analysis type'),
  body('educationLevel').optional().isString()
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid analysis request',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;
    const { analysisType, educationLevel = 'undergraduate' } = req.body;

    logger.info('Starting research analysis', { documentId, analysisType, educationLevel });

    const analysisResult = await workflowService.processResearchAnalysis(
      documentId,
      analysisType,
      educationLevel as any
    );

    res.json({
      documentId,
      analysisType,
      educationLevel,
      result: analysisResult,
      analyzedAt: new Date()
    });

  } catch (error) {
    logger.error('Research analysis error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Analysis failed',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents/:documentId/structure - Get document structure
router.get('/:documentId/structure', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;

    logger.info('Getting document structure', { documentId });

    const structure = await documentService.getDocumentStructure(documentId);

    res.json({
      documentId,
      structure,
      retrievedAt: new Date()
    });

  } catch (error) {
    logger.error('Get document structure error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to get document structure',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents/:documentId/stats - Enhanced document statistics
router.get('/:documentId/stats', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;

    logger.info('Getting enhanced document stats', { documentId });

    const stats = await documentService.getDocumentStats(documentId);
    const vectorStats = await vectorStore.getDocumentStats(documentId);

    res.json({
      documentId,
      basicStats: stats,
      vectorStats,
      retrievedAt: new Date()
    });

  } catch (error) {
    logger.error('Get document stats error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to get document statistics',
        timestamp: new Date()
      }
    });
  }
});

// POST /api/documents/:documentId/cache/warmup - Warm up vector cache
router.post('/:documentId/cache/warmup', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;

    logger.info('Warming up vector cache', { documentId });

    await vectorStore.warmupVectorCache(documentId);

    res.json({
      documentId,
      status: 'cache warmed up',
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Cache warmup error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to warm up cache',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents - List documents with pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid pagination parameters',
          details: errors.array()
        }
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await documentService.listDocuments(page, limit);

    res.json(result);

  } catch (error) {
    logger.error('List documents error', { error });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to list documents',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents/:documentId/processing-status - Get processing status
router.get('/:documentId/processing-status', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;

    const status = await documentService.getProcessingStatus(documentId);

    res.json({
      documentId,
      processingStatus: status,
      checkedAt: new Date()
    });

  } catch (error) {
    logger.error('Get processing status error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to get processing status',
        timestamp: new Date()
      }
    });
  }
});

// DELETE /api/documents/:documentId - Delete document and all associated data
router.delete('/:documentId', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array()
        }
      });
    }

    const { documentId } = req.params;

    logger.info('Deleting document', { documentId });

    await documentService.deleteDocument(documentId);

    res.json({
      documentId,
      status: 'deleted',
      deletedAt: new Date()
    });

  } catch (error) {
    logger.error('Delete document error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to delete document',
        timestamp: new Date()
      }
    });
  }
});

export default router;