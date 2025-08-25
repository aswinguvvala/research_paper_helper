import express from 'express';
import { createServer } from 'http';
import config, { env } from './config';
import { databaseManager } from './database/connection';
import { aiService } from './services/ai-service';
import logger from './utils/logger';

// Import middleware
import {
  requestId,
  loggingMiddleware,
  corsMiddleware,
  rateLimitMiddleware,
  securityMiddleware,
  compressionMiddleware,
  errorHandler,
  notFoundHandler
} from './middleware';

// Import routes
import apiRoutes from './routes';

class Server {
  private app: express.Application;
  private server: any;
  private isShuttingDown: boolean = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security and utility middleware
    this.app.use(requestId);
    this.app.use(securityMiddleware);
    this.app.use(corsMiddleware);
    this.app.use(compressionMiddleware);
    
    // Logging
    this.app.use(loggingMiddleware);
    
    // Rate limiting
    this.app.use(rateLimitMiddleware);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  private setupRoutes(): void {
    // Mount comprehensive API routes
    this.app.use('/api', apiRoutes);

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

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);
    
    // Error handler (must be last)
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    try {
      // Initialize database
      logger.info('Initializing database...');
      await databaseManager.initialize();

      // Check AI service health
      logger.info('Checking AI service health...');
      try {
        await aiService.checkHealth();
        logger.info('AI service is healthy');
      } catch (error) {
        logger.warn('AI service health check failed', { error: (error as Error).message });
        logger.warn('AI-dependent features may not work properly');
      }

      // Start HTTP server
      this.server = createServer(this.app);
      
      this.server.listen(config.server.port, config.server.host, () => {
        logger.info('Server started', {
          host: config.server.host,
          port: config.server.port,
          env: env.NODE_ENV,
          pid: process.pid
        });
        
        logger.info('Service URLs:', {
          api: `http://${config.server.host}:${config.server.port}`,
          health: `http://${config.server.host}:${config.server.port}/api/health`,
          aiService: config.ai.embeddings.serviceUrl
        });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`Received ${signal}, shutting down gracefully...`);

      // Stop accepting new requests
      this.server?.close(async () => {
        try {
          // Close database connection
          await databaseManager.close();
          
          logger.info('Server shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Handle different signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.stack });
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      gracefulShutdown('unhandledRejection');
    });
  }

  get application(): express.Application {
    return this.app;
  }
}

// Start server
const server = new Server();
server.start().catch((error) => {
  logger.error('Failed to start application', { error });
  process.exit(1);
});

export default server;