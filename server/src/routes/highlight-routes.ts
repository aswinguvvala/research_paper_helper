import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ErrorCode } from '../types';
import { databaseManager } from '../database/connection';
import logger from '../utils/logger';

const router = Router();

// Validation middleware
const validateHighlightId = [
  param('highlightId').isString().notEmpty().withMessage('Highlight ID is required')
];

const validateDocumentId = [
  param('documentId').isString().notEmpty().withMessage('Document ID is required')
];

const validateHighlightData = [
  body('documentId').isString().notEmpty().withMessage('Document ID is required'),
  body('pageNumber').isInt({ min: 1 }).withMessage('Page number must be a positive integer'),
  body('selectedText').isString().isLength({ min: 1, max: 5000 }).withMessage('Selected text must be 1-5000 characters'),
  body('startPosition').isInt({ min: 0 }).withMessage('Start position must be non-negative integer'),
  body('endPosition').isInt({ min: 0 }).withMessage('End position must be non-negative integer'),
  body('color').isIn(['yellow', 'blue', 'green', 'pink', 'orange', 'purple', 'red']).withMessage('Invalid highlight color'),
  body('notes').optional().isString().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters'),
  body('boundingBox').optional().isObject().withMessage('Bounding box must be an object'),
  body('boundingBox.x').optional().isFloat().withMessage('Bounding box x must be a number'),
  body('boundingBox.y').optional().isFloat().withMessage('Bounding box y must be a number'),
  body('boundingBox.width').optional().isFloat().withMessage('Bounding box width must be a number'),
  body('boundingBox.height').optional().isFloat().withMessage('Bounding box height must be a number')
];

// POST /api/documents/:documentId/highlights - Create a new highlight
router.post('/:documentId/highlights', [...validateDocumentId, ...validateHighlightData], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid highlight data',
          details: errors.array(),
          timestamp: new Date()
        }
      });
    }

    const { documentId } = req.params;
    const {
      pageNumber,
      selectedText,
      startPosition,
      endPosition,
      color,
      notes,
      boundingBox
    } = req.body;

    // Validate that document exists
    const db = databaseManager.database;
    const document = await db.get('SELECT id FROM documents WHERE id = ?', [documentId]);
    if (!document) {
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND,
          message: 'Document not found',
          timestamp: new Date()
        }
      });
    }

    // Generate highlight ID
    const highlightId = `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Create highlight record
    await db.run(`
      INSERT INTO highlights (
        id, document_id, page_number, selected_text, start_position, 
        end_position, color, notes, bounding_box, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      highlightId,
      documentId,
      pageNumber,
      selectedText,
      startPosition,
      endPosition,
      color,
      notes || null,
      boundingBox ? JSON.stringify(boundingBox) : null,
      now,
      now
    ]);

    // Retrieve the created highlight
    const highlight = await db.get(`
      SELECT * FROM highlights WHERE id = ?
    `, [highlightId]);

    // Format response
    const formattedHighlight = {
      id: highlight.id,
      documentId: highlight.document_id,
      pageNumber: highlight.page_number,
      selectedText: highlight.selected_text,
      startPosition: highlight.start_position,
      endPosition: highlight.end_position,
      color: highlight.color,
      notes: highlight.notes,
      boundingBox: highlight.bounding_box ? JSON.parse(highlight.bounding_box) : null,
      createdAt: new Date(highlight.created_at),
      updatedAt: new Date(highlight.updated_at)
    };

    logger.info('Highlight created', { highlightId, documentId, color, pageNumber });

    res.status(201).json({
      highlight: formattedHighlight,
      message: 'Highlight created successfully',
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Create highlight error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to create highlight',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents/:documentId/highlights - Get all highlights for a document
router.get('/:documentId/highlights', [
  ...validateDocumentId,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('pageNumber').optional().isInt({ min: 1 }).withMessage('Page number filter must be positive')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid query parameters',
          details: errors.array(),
          timestamp: new Date()
        }
      });
    }

    const { documentId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const pageNumberFilter = req.query.pageNumber ? parseInt(req.query.pageNumber as string) : null;
    const offset = (page - 1) * limit;

    const db = databaseManager.database;

    // Build query with optional page filter
    let baseQuery = 'FROM highlights WHERE document_id = ?';
    const queryParams: any[] = [documentId];

    if (pageNumberFilter) {
      baseQuery += ' AND page_number = ?';
      queryParams.push(pageNumberFilter);
    }

    // Get total count
    const countResult = await db.get(`SELECT COUNT(*) as total ${baseQuery}`, queryParams);
    const total = countResult.total || 0;

    // Get highlights with pagination
    const highlights = await db.all(`
      SELECT * ${baseQuery} 
      ORDER BY page_number ASC, created_at DESC 
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset]);

    // Format highlights
    const formattedHighlights = highlights.map(h => ({
      id: h.id,
      documentId: h.document_id,
      pageNumber: h.page_number,
      selectedText: h.selected_text,
      startPosition: h.start_position,
      endPosition: h.end_position,
      color: h.color,
      notes: h.notes,
      boundingBox: h.bounding_box ? JSON.parse(h.bounding_box) : null,
      createdAt: new Date(h.created_at),
      updatedAt: new Date(h.updated_at)
    }));

    // Get highlight statistics
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN notes IS NOT NULL THEN 1 END) as with_notes,
        COUNT(DISTINCT page_number) as pages_with_highlights
      FROM highlights 
      WHERE document_id = ?
    `, [documentId]);

    const colorStats = await db.all(`
      SELECT color, COUNT(*) as count 
      FROM highlights 
      WHERE document_id = ? 
      GROUP BY color
    `, [documentId]);

    logger.info('Highlights retrieved', { 
      documentId, 
      count: formattedHighlights.length, 
      total, 
      page, 
      pageFilter: pageNumberFilter 
    });

    res.json({
      highlights: formattedHighlights,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      stats: {
        ...stats,
        byColor: colorStats.reduce((acc, item) => {
          acc[item.color] = item.count;
          return acc;
        }, {} as Record<string, number>)
      },
      retrievedAt: new Date()
    });

  } catch (error) {
    logger.error('Get highlights error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve highlights',
        timestamp: new Date()
      }
    });
  }
});

// PUT /api/highlights/:highlightId - Update a highlight
router.put('/highlights/:highlightId', [
  ...validateHighlightId,
  body('color').optional().isIn(['yellow', 'blue', 'green', 'pink', 'orange', 'purple', 'red']).withMessage('Invalid highlight color'),
  body('notes').optional().isString().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid update data',
          details: errors.array(),
          timestamp: new Date()
        }
      });
    }

    const { highlightId } = req.params;
    const { color, notes } = req.body;

    const db = databaseManager.database;

    // Check if highlight exists
    const existing = await db.get('SELECT * FROM highlights WHERE id = ?', [highlightId]);
    if (!existing) {
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND, // Reusing error code
          message: 'Highlight not found',
          timestamp: new Date()
        }
      });
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'No valid fields to update',
          timestamp: new Date()
        }
      });
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(highlightId);

    // Update highlight
    await db.run(`
      UPDATE highlights SET ${updates.join(', ')} 
      WHERE id = ?
    `, params);

    // Retrieve updated highlight
    const updated = await db.get('SELECT * FROM highlights WHERE id = ?', [highlightId]);

    const formattedHighlight = {
      id: updated.id,
      documentId: updated.document_id,
      pageNumber: updated.page_number,
      selectedText: updated.selected_text,
      startPosition: updated.start_position,
      endPosition: updated.end_position,
      color: updated.color,
      notes: updated.notes,
      boundingBox: updated.bounding_box ? JSON.parse(updated.bounding_box) : null,
      createdAt: new Date(updated.created_at),
      updatedAt: new Date(updated.updated_at)
    };

    logger.info('Highlight updated', { highlightId, updates: { color, notes } });

    res.json({
      highlight: formattedHighlight,
      message: 'Highlight updated successfully',
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Update highlight error', { error, highlightId: req.params.highlightId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to update highlight',
        timestamp: new Date()
      }
    });
  }
});

// DELETE /api/highlights/:highlightId - Delete a highlight
router.delete('/highlights/:highlightId', validateHighlightId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid highlight ID',
          details: errors.array(),
          timestamp: new Date()
        }
      });
    }

    const { highlightId } = req.params;
    const db = databaseManager.database;

    // Check if highlight exists
    const existing = await db.get('SELECT document_id FROM highlights WHERE id = ?', [highlightId]);
    if (!existing) {
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND, // Reusing error code
          message: 'Highlight not found',
          timestamp: new Date()
        }
      });
    }

    // Delete highlight
    const result = await db.run('DELETE FROM highlights WHERE id = ?', [highlightId]);

    if (result.changes === 0) {
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND,
          message: 'Highlight not found',
          timestamp: new Date()
        }
      });
    }

    logger.info('Highlight deleted', { highlightId, documentId: existing.document_id });

    res.json({
      message: 'Highlight deleted successfully',
      highlightId,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Delete highlight error', { error, highlightId: req.params.highlightId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to delete highlight',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/highlights/:highlightId - Get a specific highlight
router.get('/highlights/:highlightId', validateHighlightId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid highlight ID',
          details: errors.array(),
          timestamp: new Date()
        }
      });
    }

    const { highlightId } = req.params;
    const db = databaseManager.database;

    const highlight = await db.get('SELECT * FROM highlights WHERE id = ?', [highlightId]);

    if (!highlight) {
      return res.status(404).json({
        error: {
          code: ErrorCode.DOCUMENT_NOT_FOUND,
          message: 'Highlight not found',
          timestamp: new Date()
        }
      });
    }

    const formattedHighlight = {
      id: highlight.id,
      documentId: highlight.document_id,
      pageNumber: highlight.page_number,
      selectedText: highlight.selected_text,
      startPosition: highlight.start_position,
      endPosition: highlight.end_position,
      color: highlight.color,
      notes: highlight.notes,
      boundingBox: highlight.bounding_box ? JSON.parse(highlight.bounding_box) : null,
      createdAt: new Date(highlight.created_at),
      updatedAt: new Date(highlight.updated_at)
    };

    res.json({
      highlight: formattedHighlight,
      retrievedAt: new Date()
    });

  } catch (error) {
    logger.error('Get highlight error', { error, highlightId: req.params.highlightId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve highlight',
        timestamp: new Date()
      }
    });
  }
});

// GET /api/documents/:documentId/highlights/export - Export highlights as JSON
router.get('/:documentId/highlights/export', validateDocumentId, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid document ID',
          details: errors.array(),
          timestamp: new Date()
        }
      });
    }

    const { documentId } = req.params;
    const db = databaseManager.database;

    // Get all highlights for the document
    const highlights = await db.all(`
      SELECT * FROM highlights 
      WHERE document_id = ? 
      ORDER BY page_number ASC, created_at DESC
    `, [documentId]);

    const formattedHighlights = highlights.map(h => ({
      id: h.id,
      documentId: h.document_id,
      pageNumber: h.page_number,
      selectedText: h.selected_text,
      startPosition: h.start_position,
      endPosition: h.end_position,
      color: h.color,
      notes: h.notes,
      boundingBox: h.bounding_box ? JSON.parse(h.bounding_box) : null,
      createdAt: new Date(h.created_at),
      updatedAt: new Date(h.updated_at)
    }));

    // Get document info for export
    const document = await db.get('SELECT filename, title FROM documents WHERE id = ?', [documentId]);

    const exportData = {
      document: {
        id: documentId,
        filename: document?.filename || 'Unknown',
        title: document?.title || 'Untitled'
      },
      highlights: formattedHighlights,
      exportedAt: new Date(),
      version: '1.0'
    };

    logger.info('Highlights exported', { documentId, count: formattedHighlights.length });

    // Set appropriate headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="highlights-${documentId}.json"`);
    
    res.json(exportData);

  } catch (error) {
    logger.error('Export highlights error', { error, documentId: req.params.documentId });
    
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to export highlights',
        timestamp: new Date()
      }
    });
  }
});

export default router;