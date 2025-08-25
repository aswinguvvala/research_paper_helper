import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import logger, { requestLogger } from '../utils/logger';
import { ApiError, ErrorCode } from '../types';

// Request ID middleware
export const requestId = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Enhanced logging middleware
export const loggingMiddleware = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message: string) => {
        requestLogger.info(message.trim());
      }
    }
  }
);

// CORS middleware
export const corsMiddleware = cors({
  origin: config.server.cors.origin,
  credentials: config.server.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID']
});

// Rate limiting middleware
export const rateLimitMiddleware = rateLimit({
  windowMs: config.server.rateLimit.windowMs,
  max: config.server.rateLimit.maxRequests,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.server.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.id
    });
    
    res.status(429).json({
      error: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Too many requests, please try again later.',
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  }
});

// Security middleware
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      workerSrc: ["'self'", "blob:", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:5000"], // Allow connection to AI service
    },
  },
  crossOriginEmbedderPolicy: false // Required for some PDF viewers
});

// Compression middleware
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
});

// Request validation middleware
export const validateContentType = (expectedType: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const contentType = req.get('Content-Type');
      if (!contentType || !contentType.includes(expectedType)) {
        return res.status(400).json({
          error: ErrorCode.VALIDATION_ERROR,
          message: `Content-Type must be ${expectedType}`,
          timestamp: new Date().toISOString(),
          requestId: req.id
        });
      }
    }
    next();
  };
};

// Error handling middleware
export const errorHandler = (
  error: Error | ApiError,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Log the error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    requestId: req.id,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Handle API errors
  if ('code' in error) {
    const apiError = error as ApiError;
    const statusCode = getStatusCodeForError(apiError.code);
    
    return res.status(statusCode).json({
      error: apiError.code,
      message: apiError.message,
      timestamp: apiError.timestamp.toISOString(),
      requestId: req.id,
      ...(apiError.details && { details: apiError.details })
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: ErrorCode.VALIDATION_ERROR,
      message: error.message,
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  }

  // Handle multer errors (file upload)
  if (error.name === 'MulterError') {
    const multerError = error as any;
    let message = 'File upload error';
    
    switch (multerError.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files';
        break;
    }

    return res.status(400).json({
      error: ErrorCode.VALIDATION_ERROR,
      message,
      timestamp: new Date().toISOString(),
      requestId: req.id
    });
  }

  // Generic error handling
  const statusCode = 500;
  res.status(statusCode).json({
    error: ErrorCode.INTERNAL_SERVER_ERROR,
    message: 'An internal server error occurred',
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
};

// 404 handler
export const notFoundHandler = (
  req: express.Request,
  res: express.Response
) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Route not found',
    timestamp: new Date().toISOString(),
    requestId: req.id,
    availableRoutes: [
      'GET /api/health',
      'POST /api/documents',
      'GET /api/documents/:id',
      'POST /api/chat',
      'POST /api/search'
    ]
  });
};

// Utility function to map error codes to HTTP status codes
function getStatusCodeForError(errorCode: ErrorCode): number {
  switch (errorCode) {
    case ErrorCode.VALIDATION_ERROR:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.DOCUMENT_NOT_FOUND:
      return 404;
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;
    case ErrorCode.AI_SERVICE_ERROR:
    case ErrorCode.PROCESSING_FAILED:
      return 503;
    case ErrorCode.INTERNAL_SERVER_ERROR:
    default:
      return 500;
  }
}

// Health check middleware for dependencies
export const healthCheckDependencies = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    // This will be expanded as we add more dependencies
    next();
  } catch (error) {
    next(error);
  }
};

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}