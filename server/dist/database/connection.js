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
exports.databaseManager = exports.DatabaseManager = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const config_1 = __importStar(require("../config"));
const logger_1 = __importDefault(require("../utils/logger"));
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }
    async initialize() {
        try {
            // Ensure the directory exists
            const dbPath = config_1.default.database.url;
            const dbDir = path_1.default.dirname(dbPath);
            await promises_1.default.mkdir(dbDir, { recursive: true });
            // Open database connection
            this.db = await (0, sqlite_1.open)({
                filename: dbPath,
                driver: sqlite3_1.default.Database
            });
            if (config_1.env.ENABLE_DB_LOGGING) {
                this.db.on('trace', (sql) => {
                    logger_1.default.debug('SQL Query', { sql });
                });
            }
            // Enable foreign keys
            await this.db.exec('PRAGMA foreign_keys = ON');
            // Create tables
            await this.createTables();
            this.isInitialized = true;
            logger_1.default.info('Database initialized successfully', { path: dbPath });
        }
        catch (error) {
            logger_1.default.error('Failed to initialize database', { error });
            throw error;
        }
    }
    async createTables() {
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
            await this.db.exec(tableSQL);
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
            await this.db.exec(indexSQL);
        }
        logger_1.default.info('Database tables and indexes created successfully');
    }
    async close() {
        if (this.db) {
            await this.db.close();
            this.db = null;
            this.isInitialized = false;
            logger_1.default.info('Database connection closed');
        }
    }
    get database() {
        if (!this.db || !this.isInitialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.db;
    }
    get ready() {
        return this.isInitialized && this.db !== null;
    }
    // Health check
    async healthCheck() {
        try {
            if (!this.ready)
                return false;
            await this.db.get('SELECT 1');
            return true;
        }
        catch (error) {
            logger_1.default.error('Database health check failed', { error });
            return false;
        }
    }
    // Backup functionality
    async backup(backupPath) {
        if (!this.ready) {
            throw new Error('Database not ready for backup');
        }
        try {
            await this.db.backup(backupPath);
            logger_1.default.info('Database backup created', { backupPath });
        }
        catch (error) {
            logger_1.default.error('Database backup failed', { error, backupPath });
            throw error;
        }
    }
}
exports.DatabaseManager = DatabaseManager;
// Singleton instance
exports.databaseManager = new DatabaseManager();
