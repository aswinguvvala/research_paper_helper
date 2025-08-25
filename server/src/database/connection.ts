import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs/promises';
import config, { env } from '../config';
import logger from '../utils/logger';

export class DatabaseManager {
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    try {
      // Ensure the directory exists
      const dbPath = config.database.url;
      const dbDir = path.dirname(dbPath);
      await fs.mkdir(dbDir, { recursive: true });

      // Open database connection
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      if (env.ENABLE_DB_LOGGING) {
        this.db.on('trace', (sql) => {
          logger.debug('SQL Query', { sql });
        });
      }

      // Enable foreign keys
      await this.db.exec('PRAGMA foreign_keys = ON');

      // Create tables
      await this.createTables();

      this.isInitialized = true;
      logger.info('Database initialized successfully', { path: dbPath });
    } catch (error) {
      logger.error('Failed to initialize database', { error });
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const tables = [
      // Documents table
      `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        title TEXT,
        authors TEXT, -- JSON array
        abstract TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        total_pages INTEGER NOT NULL,
        total_chunks INTEGER DEFAULT 0,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        metadata TEXT -- JSON object
      )`,

      // Document chunks table
      `CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB, -- Stored as binary
        page_number INTEGER NOT NULL,
        section_title TEXT,
        section_type TEXT NOT NULL,
        start_position INTEGER NOT NULL,
        end_position INTEGER NOT NULL,
        confidence REAL DEFAULT 1.0,
        bounding_box TEXT, -- JSON object
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      )`,

      // Conversation sessions table
      `CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id TEXT,
        education_level TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_messages INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        metadata TEXT, -- JSON object
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      )`,

      // Chat messages table
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        highlighted_text TEXT, -- JSON object
        citations TEXT, -- JSON array
        related_chunks TEXT, -- JSON array of chunk IDs
        confidence REAL,
        tokens INTEGER,
        metadata TEXT, -- JSON object
        FOREIGN KEY (session_id) REFERENCES conversation_sessions (id) ON DELETE CASCADE
      )`,

      // Embeddings cache table (for query caching)
      `CREATE TABLE IF NOT EXISTS embedding_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text_hash TEXT UNIQUE NOT NULL,
        embedding BLOB NOT NULL,
        model_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Document fingerprints table (for caching and version control)
      `CREATE TABLE IF NOT EXISTS document_fingerprints (
        document_id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        structure_hash TEXT NOT NULL,
        embedding_version TEXT NOT NULL,
        last_processed DATETIME NOT NULL,
        chunk_count INTEGER DEFAULT 0,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      )`,

      // Document structure table (hierarchical sections)
      `CREATE TABLE IF NOT EXISTS document_sections (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        parent_section_id TEXT,
        section_type TEXT NOT NULL,
        title TEXT NOT NULL,
        level INTEGER NOT NULL,
        page_start INTEGER NOT NULL,
        page_end INTEGER NOT NULL,
        keywords TEXT, -- JSON array
        sentence_count INTEGER DEFAULT 0,
        readability_score REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
        FOREIGN KEY (parent_section_id) REFERENCES document_sections (id) ON DELETE CASCADE
      )`,

      // Search analytics table (for monitoring and optimization)
      `CREATE TABLE IF NOT EXISTS search_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        query TEXT NOT NULL,
        query_hash TEXT NOT NULL,
        search_strategy TEXT NOT NULL,
        result_count INTEGER NOT NULL,
        processing_time REAL NOT NULL,
        session_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      )`
    ];

    for (const tableSQL of tables) {
      await this.db!.exec(tableSQL);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id)',
      'CREATE INDEX IF NOT EXISTS idx_document_chunks_section_type ON document_chunks (section_type)',
      'CREATE INDEX IF NOT EXISTS idx_document_chunks_page_number ON document_chunks (page_number)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages (session_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages (timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_conversation_sessions_document_id ON conversation_sessions (document_id)',
      'CREATE INDEX IF NOT EXISTS idx_embedding_cache_text_hash ON embedding_cache (text_hash)',
      'CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents (uploaded_at)',
      'CREATE INDEX IF NOT EXISTS idx_document_sections_document_id ON document_sections (document_id)',
      'CREATE INDEX IF NOT EXISTS idx_document_sections_parent ON document_sections (parent_section_id)',
      'CREATE INDEX IF NOT EXISTS idx_document_sections_level ON document_sections (level)',
      'CREATE INDEX IF NOT EXISTS idx_search_analytics_document_id ON search_analytics (document_id)',
      'CREATE INDEX IF NOT EXISTS idx_search_analytics_query_hash ON search_analytics (query_hash)',
      'CREATE INDEX IF NOT EXISTS idx_search_analytics_timestamp ON search_analytics (timestamp)'
    ];

    for (const indexSQL of indexes) {
      await this.db!.exec(indexSQL);
    }

    logger.info('Database tables and indexes created successfully');
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      logger.info('Database connection closed');
    }
  }

  get database(): Database<sqlite3.Database, sqlite3.Statement> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  get ready(): boolean {
    return this.isInitialized && this.db !== null;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.ready) return false;
      await this.db!.get('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }

  // Backup functionality
  async backup(backupPath: string): Promise<void> {
    if (!this.ready) {
      throw new Error('Database not ready for backup');
    }

    try {
      await this.db!.backup(backupPath);
      logger.info('Database backup created', { backupPath });
    } catch (error) {
      logger.error('Database backup failed', { error, backupPath });
      throw error;
    }
  }
}

// Singleton instance
export const databaseManager = new DatabaseManager();