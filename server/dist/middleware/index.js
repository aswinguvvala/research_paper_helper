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
exports.healthCheckDependencies = exports.notFoundHandler = exports.errorHandler = exports.validateContentType = exports.compressionMiddleware = exports.securityMiddleware = exports.rateLimitMiddleware = exports.corsMiddleware = exports.loggingMiddleware = exports.requestId = void 0;
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const morgan_1 = __importDefault(require("morgan"));
const uuid_1 = require("uuid");
const config_1 = __importDefault(require("../config"));
const logger_1 = __importStar(require("../utils/logger"));
const types_1 = require("../types");
// Request ID middleware
const requestId = (req, res, next) => {
    req.id = (0, uuid_1.v4)();
    res.setHeader('X-Request-ID', req.id);
    next();
};
exports.requestId = requestId;
// Enhanced logging middleware
exports.loggingMiddleware = (0, morgan_1.default)(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
        write: (message) => {
            logger_1.requestLogger.info(message.trim());
        }
    }
});
// CORS middleware
exports.corsMiddleware = (0, cors_1.default)({
    origin: config_1.default.server.cors.origin,
    credentials: config_1.default.server.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID']
});
// Rate limiting middleware
exports.rateLimitMiddleware = (0, express_rate_limit_1.default)({
    windowMs: config_1.default.server.rateLimit.windowMs,
    max: config_1.default.server.rateLimit.maxRequests,
    message: {
        error: 'rate_limit_exceeded',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config_1.default.server.rateLimit.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_1.default.warn('Rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            requestId: req.id
        });
        res.status(429).json({
            error: types_1.ErrorCode.RATE_LIMIT_EXCEEDED,
            message: 'Too many requests, please try again later.',
            timestamp: new Date().toISOString(),
            requestId: req.id
        });
    }
});
// Security middleware
exports.securityMiddleware = (0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "http://localhost:5000"], // Allow connection to AI service
        },
    },
    crossOriginEmbedderPolicy: false // Required for some PDF viewers
});
// Compression middleware
exports.compressionMiddleware = (0, compression_1.default)({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression_1.default.filter(req, res);
    },
    level: 6,
    threshold: 1024
});
// Request validation middleware
const validateContentType = (expectedType) => {
    return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'DELETE') {
            const contentType = req.get('Content-Type');
            if (!contentType || !contentType.includes(expectedType)) {
                return res.status(400).json({
                    error: types_1.ErrorCode.VALIDATION_ERROR,
                    message: `Content-Type must be ${expectedType}`,
                    timestamp: new Date().toISOString(),
                    requestId: req.id
                });
            }
        }
        next();
    };
};
exports.validateContentType = validateContentType;
// Error handling middleware
const errorHandler = (error, req, res, next) => {
    // Log the error
    logger_1.default.error('Request error', {
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
        const apiError = error;
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
            error: types_1.ErrorCode.VALIDATION_ERROR,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: req.id
        });
    }
    // Handle multer errors (file upload)
    if (error.name === 'MulterError') {
        const multerError = error;
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
            error: types_1.ErrorCode.VALIDATION_ERROR,
            message,
            timestamp: new Date().toISOString(),
            requestId: req.id
        });
    }
    // Generic error handling
    const statusCode = 500;
    res.status(statusCode).json({
        error: types_1.ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'An internal server error occurred',
        timestamp: new Date().toISOString(),
        requestId: req.id
    });
};
exports.errorHandler = errorHandler;
// 404 handler
const notFoundHandler = (req, res) => {
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
exports.notFoundHandler = notFoundHandler;
// Utility function to map error codes to HTTP status codes
function getStatusCodeForError(errorCode) {
    switch (errorCode) {
        case types_1.ErrorCode.VALIDATION_ERROR:
            return 400;
        case types_1.ErrorCode.UNAUTHORIZED:
            return 401;
        case types_1.ErrorCode.DOCUMENT_NOT_FOUND:
            return 404;
        case types_1.ErrorCode.RATE_LIMIT_EXCEEDED:
            return 429;
        case types_1.ErrorCode.AI_SERVICE_ERROR:
        case types_1.ErrorCode.PROCESSING_FAILED:
            return 503;
        case types_1.ErrorCode.INTERNAL_SERVER_ERROR:
        default:
            return 500;
    }
}
// Health check middleware for dependencies
const healthCheckDependencies = async (req, res, next) => {
    try {
        // This will be expanded as we add more dependencies
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.healthCheckDependencies = healthCheckDependencies;
