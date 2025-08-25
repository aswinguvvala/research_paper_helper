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
exports.pdfProcessor = exports.PDFProcessor = void 0;
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const promises_1 = __importDefault(require("fs/promises"));
const crypto_1 = __importDefault(require("crypto"));
const natural = __importStar(require("natural"));
const compromise_1 = __importDefault(require("compromise"));
const types_1 = require("../types");
const types_2 = require("../types");
const logger_1 = __importDefault(require("../../utils/logger"));
class PDFProcessor {
    constructor() {
        this.defaultOptions = {
            chunkSize: 1000,
            chunkOverlap: 200,
            preserveStructure: true,
            extractMetadata: true
        };
        this.sentenceTokenizer = new natural.SentenceTokenizer();
        this.wordTokenizer = new natural.WordTokenizer();
        this.stemmer = natural.PorterStemmer;
    }
    async processDocument(filePath, filename, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        try {
            logger_1.default.info('Starting PDF processing', { filename, filePath });
            // Parse PDF
            const parsed = await this.parsePDF(filePath);
            // Extract document metadata
            const metadata = await this.extractDocumentMetadata(filename, filePath, parsed);
            // Process into chunks
            const chunks = await this.createChunks(metadata.id, parsed, opts);
            logger_1.default.info('PDF processing completed', {
                documentId: metadata.id,
                totalPages: metadata.totalPages,
                totalChunks: chunks.length
            });
            return { metadata, chunks };
        }
        catch (error) {
            logger_1.default.error('PDF processing failed', { error, filename });
            throw error;
        }
    }
    async parsePDF(filePath) {
        try {
            const buffer = await promises_1.default.readFile(filePath);
            const pdfData = await (0, pdf_parse_1.default)(buffer, {
                // Advanced parsing options
                normalizeWhitespace: true,
                disableCombineTextItems: false
            });
            // Enhanced parsing with page-by-page analysis
            const pages = await this.parsePages(buffer);
            return {
                text: pdfData.text,
                numPages: pdfData.numpages,
                info: pdfData.info,
                metadata: pdfData.metadata,
                pages
            };
        }
        catch (error) {
            logger_1.default.error('PDF parsing failed', { error, filePath });
            throw new Error(`Failed to parse PDF: ${error.message}`);
        }
    }
    async parsePages(buffer) {
        // This is a simplified implementation
        // In a production system, you'd use a more sophisticated PDF parser
        // like PDF2pic with OCR or pdf-lib for better structure detection
        try {
            const pdfData = await (0, pdf_parse_1.default)(buffer);
            const pageTexts = this.splitTextByPages(pdfData.text, pdfData.numpages);
            return pageTexts.map((text, index) => ({
                pageNumber: index + 1,
                text,
                lines: this.extractTextLines(text),
                sections: this.detectSections(text, index + 1)
            }));
        }
        catch (error) {
            logger_1.default.error('Page parsing failed', { error });
            throw error;
        }
    }
    splitTextByPages(text, numPages) {
        // Simple page splitting - in production, use better PDF parsing
        const lines = text.split('\n');
        const linesPerPage = Math.ceil(lines.length / numPages);
        const pages = [];
        for (let i = 0; i < numPages; i++) {
            const startLine = i * linesPerPage;
            const endLine = Math.min((i + 1) * linesPerPage, lines.length);
            pages.push(lines.slice(startLine, endLine).join('\n'));
        }
        return pages;
    }
    extractTextLines(pageText) {
        // Simplified line extraction - in production, use PDF.js or similar
        return pageText.split('\n').map((text, index) => ({
            text: text.trim(),
            x: 0,
            y: index * 20, // Estimated line height
            width: text.length * 8, // Estimated character width
            height: 20,
            fontSize: 12,
            fontName: 'unknown'
        }));
    }
    detectSections(pageText, pageNumber) {
        const sections = [];
        const lines = pageText.split('\n');
        // Academic paper section patterns
        const sectionPatterns = [
            { pattern: /^(abstract|summary)$/i, type: types_1.SectionType.ABSTRACT, confidence: 0.9 },
            { pattern: /^(introduction|intro)$/i, type: types_1.SectionType.INTRODUCTION, confidence: 0.9 },
            { pattern: /^(methodology|methods|approach)$/i, type: types_1.SectionType.METHODOLOGY, confidence: 0.9 },
            { pattern: /^(results|findings)$/i, type: types_1.SectionType.RESULTS, confidence: 0.9 },
            { pattern: /^(discussion|analysis)$/i, type: types_1.SectionType.DISCUSSION, confidence: 0.8 },
            { pattern: /^(conclusion|conclusions)$/i, type: types_1.SectionType.CONCLUSION, confidence: 0.9 },
            { pattern: /^(references|bibliography)$/i, type: types_1.SectionType.REFERENCES, confidence: 0.9 },
            { pattern: /^(figure|fig\.?\s+\d+)/i, type: types_1.SectionType.FIGURE, confidence: 0.8 },
            { pattern: /^(table|tbl\.?\s+\d+)/i, type: types_1.SectionType.TABLE, confidence: 0.8 }
        ];
        lines.forEach((line, lineIndex) => {
            const trimmed = line.trim();
            if (trimmed.length === 0)
                return;
            // Check if line matches section patterns
            for (const { pattern, type, confidence } of sectionPatterns) {
                if (pattern.test(trimmed)) {
                    sections.push({
                        type,
                        title: trimmed,
                        startLine: lineIndex,
                        endLine: lineIndex, // Will be updated when we find the next section
                        confidence
                    });
                    break;
                }
            }
            // Detect titles (short lines in caps or title case)
            if (this.looksLikeTitle(trimmed) && pageNumber === 1) {
                sections.push({
                    type: types_1.SectionType.TITLE,
                    title: trimmed,
                    startLine: lineIndex,
                    endLine: lineIndex,
                    confidence: 0.7
                });
            }
        });
        // Update end lines for sections
        sections.forEach((section, index) => {
            if (index < sections.length - 1) {
                section.endLine = sections[index + 1].startLine - 1;
            }
            else {
                section.endLine = lines.length - 1;
            }
        });
        return sections;
    }
    looksLikeTitle(text) {
        // Heuristics for title detection
        if (text.length < 10 || text.length > 200)
            return false;
        if (text.includes('.') && !text.endsWith('.'))
            return false;
        const words = text.split(' ');
        if (words.length < 3)
            return false;
        // Check if most words are capitalized (title case)
        const capitalizedWords = words.filter(word => word.length > 0 && word[0] === word[0].toUpperCase());
        return capitalizedWords.length / words.length > 0.6;
    }
    async extractDocumentMetadata(filename, filePath, parsed) {
        const fileStats = await promises_1.default.stat(filePath);
        // Extract title from first page or PDF metadata
        let title = parsed.info?.Title || null;
        if (!title && parsed.pages.length > 0) {
            const titleSections = parsed.pages[0].sections.filter(s => s.type === types_1.SectionType.TITLE);
            title = titleSections.length > 0 ? titleSections[0].title : null;
        }
        // Extract authors from PDF metadata or first page
        let authors = [];
        if (parsed.info?.Author) {
            authors = [parsed.info.Author];
        }
        // Extract abstract
        let abstract;
        for (const page of parsed.pages) {
            const abstractSection = page.sections.find(s => s.type === types_1.SectionType.ABSTRACT);
            if (abstractSection) {
                const lines = page.text.split('\n');
                abstract = lines
                    .slice(abstractSection.startLine + 1, abstractSection.endLine + 1)
                    .join(' ')
                    .trim();
                break;
            }
        }
        return {
            id: (0, types_2.generateId)(),
            filename,
            title,
            authors: authors.length > 0 ? authors : undefined,
            abstract,
            uploadedAt: new Date(),
            processedAt: new Date(),
            totalPages: parsed.numPages,
            totalChunks: 0, // Will be updated after chunking
            fileSize: fileStats.size,
            mimeType: 'application/pdf'
        };
    }
    async createChunks(documentId, parsed, options) {
        const chunks = [];
        for (const page of parsed.pages) {
            const pageChunks = await this.chunkPage(documentId, page, options);
            chunks.push(...pageChunks);
        }
        return chunks;
    }
    async chunkPage(documentId, page, options) {
        const chunks = [];
        if (options.preserveStructure) {
            // Chunk by detected sections
            for (const section of page.sections) {
                const sectionChunks = await this.chunkSection(documentId, page, section, options);
                chunks.push(...sectionChunks);
            }
            // Handle text not in any section
            const sectionLines = new Set();
            page.sections.forEach(section => {
                for (let i = section.startLine; i <= section.endLine; i++) {
                    sectionLines.add(i);
                }
            });
            const unsectionedText = page.text
                .split('\n')
                .filter((_, index) => !sectionLines.has(index))
                .join('\n')
                .trim();
            if (unsectionedText.length > 0) {
                const unsectionedChunks = await this.chunkText(documentId, unsectionedText, page.pageNumber, types_1.SectionType.OTHER, options);
                chunks.push(...unsectionedChunks);
            }
        }
        else {
            // Simple text-based chunking
            const textChunks = await this.chunkText(documentId, page.text, page.pageNumber, types_1.SectionType.OTHER, options);
            chunks.push(...textChunks);
        }
        return chunks;
    }
    async chunkSection(documentId, page, section, options) {
        const lines = page.text.split('\n');
        const sectionText = lines
            .slice(section.startLine, section.endLine + 1)
            .join('\n')
            .trim();
        return this.chunkText(documentId, sectionText, page.pageNumber, section.type, options, section.title);
    }
    async chunkText(documentId, text, pageNumber, sectionType, options, sectionTitle) {
        const chunks = [];
        if (text.length <= options.chunkSize) {
            // Text fits in one chunk
            chunks.push(this.createChunk(documentId, text, pageNumber, sectionType, sectionTitle, 0, text.length));
        }
        else {
            // Split text into overlapping chunks
            let start = 0;
            let chunkIndex = 0;
            while (start < text.length) {
                let end = Math.min(start + options.chunkSize, text.length);
                // Try to break at sentence boundaries
                if (end < text.length) {
                    const sentenceEnd = this.findSentenceBreak(text, end);
                    if (sentenceEnd > start && sentenceEnd - start >= options.chunkSize * 0.5) {
                        end = sentenceEnd;
                    }
                }
                const chunkText = text.slice(start, end).trim();
                if (chunkText.length > 0) {
                    chunks.push(this.createChunk(documentId, chunkText, pageNumber, sectionType, sectionTitle, start, end));
                }
                // Move start position with overlap
                start = Math.max(start + options.chunkSize - options.chunkOverlap, end);
                chunkIndex++;
            }
        }
        return chunks;
    }
    findSentenceBreak(text, position) {
        // Look for sentence endings near the position
        const searchRange = 100; // Characters to search before position
        const searchStart = Math.max(0, position - searchRange);
        const searchText = text.slice(searchStart, position + searchRange);
        const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        let bestBreak = position;
        for (const ending of sentenceEndings) {
            const index = searchText.lastIndexOf(ending);
            if (index !== -1) {
                const actualPosition = searchStart + index + ending.length;
                if (actualPosition > searchStart && actualPosition <= position + searchRange) {
                    bestBreak = actualPosition;
                    break;
                }
            }
        }
        return bestBreak;
    }
    createChunk(documentId, content, pageNumber, sectionType, sectionTitle, startPosition, endPosition) {
        // Create bounding box (simplified - in production, use actual PDF coordinates)
        const boundingBox = {
            x: 0,
            y: startPosition * 0.1, // Estimated
            width: 100, // Percentage of page width
            height: (endPosition - startPosition) * 0.1
        };
        const metadata = {
            pageNumber,
            sectionTitle,
            sectionType,
            startPosition,
            endPosition,
            boundingBox,
            confidence: 0.8 // Default confidence
        };
        return {
            id: (0, types_2.generateId)(),
            documentId,
            content,
            metadata,
            createdAt: new Date()
        };
    }
    async cleanup(filePath) {
        try {
            await promises_1.default.unlink(filePath);
            logger_1.default.info('Cleaned up temporary file', { filePath });
        }
        catch (error) {
            logger_1.default.warn('Failed to cleanup temporary file', { error, filePath });
        }
    }
    // Advanced Document Structure Analysis
    async analyzeDocumentStructure(parsed) {
        logger_1.default.info('Analyzing document structure');
        const structure = {
            authors: [],
            sections: [],
            citations: [],
            figures: [],
            tables: [],
            equations: []
        };
        // Extract hierarchical sections
        structure.sections = await this.buildHierarchicalSections(parsed);
        // Extract citations
        structure.citations = this.extractCitations(parsed);
        // Extract figures and tables
        structure.figures = this.extractFigures(parsed);
        structure.tables = this.extractTables(parsed);
        // Extract equations
        structure.equations = this.extractEquations(parsed);
        return structure;
    }
    async buildHierarchicalSections(parsed) {
        const hierarchicalSections = [];
        const sectionStack = [];
        for (const page of parsed.pages) {
            const sections = this.detectAdvancedSections(page.text, page.pageNumber);
            for (const detectedSection of sections) {
                const section = {
                    id: (0, types_2.generateId)(),
                    type: detectedSection.type,
                    title: detectedSection.title,
                    level: detectedSection.level,
                    content: this.extractSectionContent(page.text, detectedSection),
                    pageStart: page.pageNumber,
                    pageEnd: page.pageNumber,
                    children: [],
                    keywords: this.extractKeywords(this.extractSectionContent(page.text, detectedSection)),
                    sentenceCount: this.countSentences(this.extractSectionContent(page.text, detectedSection)),
                    readabilityScore: this.calculateReadabilityScore(this.extractSectionContent(page.text, detectedSection))
                };
                // Build hierarchy
                while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= section.level) {
                    sectionStack.pop();
                }
                if (sectionStack.length > 0) {
                    const parent = sectionStack[sectionStack.length - 1];
                    section.parent = parent.id;
                    parent.children.push(section);
                }
                else {
                    hierarchicalSections.push(section);
                }
                sectionStack.push(section);
            }
        }
        return hierarchicalSections;
    }
    detectAdvancedSections(pageText, pageNumber) {
        const sections = [];
        const lines = pageText.split('\n');
        // Enhanced section patterns with hierarchy detection
        const sectionPatterns = [
            { pattern: /^(\d+\.?\s+)?(abstract|summary)$/i, type: types_1.SectionType.ABSTRACT, level: 1, confidence: 0.95 },
            { pattern: /^(\d+\.?\s+)?(introduction|intro)$/i, type: types_1.SectionType.INTRODUCTION, level: 1, confidence: 0.95 },
            { pattern: /^(\d+\.?\s+)?(related\s+work|literature\s+review|background)$/i, type: types_1.SectionType.OTHER, level: 1, confidence: 0.9 },
            { pattern: /^(\d+\.?\s+)?(methodology|methods|approach|framework)$/i, type: types_1.SectionType.METHODOLOGY, level: 1, confidence: 0.95 },
            { pattern: /^(\d+\.?\s+)?(results|findings|experiments?)$/i, type: types_1.SectionType.RESULTS, level: 1, confidence: 0.95 },
            { pattern: /^(\d+\.?\s+)?(discussion|analysis|evaluation)$/i, type: types_1.SectionType.DISCUSSION, level: 1, confidence: 0.9 },
            { pattern: /^(\d+\.?\s+)?(conclusion|conclusions|summary)$/i, type: types_1.SectionType.CONCLUSION, level: 1, confidence: 0.95 },
            { pattern: /^(\d+\.?\s+)?(references|bibliography|citations)$/i, type: types_1.SectionType.REFERENCES, level: 1, confidence: 0.95 },
            // Subsection patterns
            { pattern: /^(\d+\.\d+\.?\s+)(.+)$/i, type: types_1.SectionType.OTHER, level: 2, confidence: 0.8 },
            { pattern: /^(\d+\.\d+\.\d+\.?\s+)(.+)$/i, type: types_1.SectionType.OTHER, level: 3, confidence: 0.7 },
            // Figure and table patterns
            { pattern: /^(figure|fig\.?\s+\d+)/i, type: types_1.SectionType.FIGURE, level: 0, confidence: 0.9 },
            { pattern: /^(table|tbl\.?\s+\d+)/i, type: types_1.SectionType.TABLE, level: 0, confidence: 0.9 }
        ];
        lines.forEach((line, lineIndex) => {
            const trimmed = line.trim();
            if (trimmed.length === 0)
                return;
            // Check section patterns
            for (const { pattern, type, level, confidence } of sectionPatterns) {
                const match = pattern.exec(trimmed);
                if (match) {
                    sections.push({
                        type,
                        title: match[2] || trimmed,
                        startLine: lineIndex,
                        endLine: lineIndex,
                        confidence,
                        level,
                        children: []
                    });
                    break;
                }
            }
            // Detect title-like sections using NLP
            if (pageNumber === 1 && this.looksLikeTitle(trimmed)) {
                sections.push({
                    type: types_1.SectionType.TITLE,
                    title: trimmed,
                    startLine: lineIndex,
                    endLine: lineIndex,
                    confidence: 0.8,
                    level: 0,
                    children: []
                });
            }
        });
        // Update end lines and build relationships
        this.updateSectionBoundaries(sections, lines.length);
        return sections;
    }
    extractSectionContent(pageText, section) {
        const lines = pageText.split('\n');
        return lines
            .slice(section.startLine + 1, section.endLine + 1)
            .join(' ')
            .trim();
    }
    extractKeywords(content) {
        if (!content || content.length < 10)
            return [];
        // Use compromise for better keyword extraction
        const doc = (0, compromise_1.default)(content);
        // Extract important terms
        const nouns = doc.nouns().out('array');
        const adjectives = doc.adjectives().out('array');
        const organizations = doc.organizations().out('array');
        const topics = doc.topics().out('array');
        // Combine and filter
        const allKeywords = [...nouns, ...adjectives, ...organizations, ...topics];
        const filteredKeywords = allKeywords
            .filter(word => word.length > 3)
            .filter(word => !this.isStopWord(word))
            .slice(0, 10); // Top 10 keywords
        return [...new Set(filteredKeywords)]; // Remove duplicates
    }
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'may', 'might', 'must', 'can', 'cannot', 'would', 'could', 'should', 'may'
        ]);
        return stopWords.has(word.toLowerCase());
    }
    countSentences(content) {
        if (!content)
            return 0;
        return this.sentenceTokenizer.tokenize(content).length;
    }
    calculateReadabilityScore(content) {
        if (!content || content.length < 10)
            return 0;
        // Simple Flesch Reading Ease approximation
        const sentences = this.sentenceTokenizer.tokenize(content);
        const words = this.wordTokenizer.tokenize(content);
        if (sentences.length === 0 || words.length === 0)
            return 0;
        const avgSentenceLength = words.length / sentences.length;
        const avgSyllables = this.estimateAverageSyllables(words);
        // Simplified Flesch formula
        const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllables);
        return Math.max(0, Math.min(100, score));
    }
    estimateAverageSyllables(words) {
        if (words.length === 0)
            return 0;
        const totalSyllables = words.reduce((sum, word) => {
            return sum + this.countSyllables(word);
        }, 0);
        return totalSyllables / words.length;
    }
    countSyllables(word) {
        if (!word)
            return 0;
        word = word.toLowerCase();
        let count = 0;
        let prevWasVowel = false;
        for (let i = 0; i < word.length; i++) {
            const isVowel = 'aeiouy'.includes(word[i]);
            if (isVowel && !prevWasVowel)
                count++;
            prevWasVowel = isVowel;
        }
        // Adjust for silent 'e'
        if (word.endsWith('e') && count > 1)
            count--;
        return Math.max(1, count);
    }
    extractCitations(parsed) {
        const citations = [];
        for (const page of parsed.pages) {
            const citationMatches = page.text.match(/\[\d+\]|\(\d{4}\)|[A-Z][a-z]+\s+et\s+al\.\s+\(\d{4}\)/g);
            if (citationMatches) {
                citationMatches.forEach((citation, index) => {
                    citations.push({
                        id: `cite_${page.pageNumber}_${index}`,
                        text: citation,
                        pageNumber: page.pageNumber,
                        inTextReferences: []
                    });
                });
            }
        }
        return citations;
    }
    extractFigures(parsed) {
        const figures = [];
        for (const page of parsed.pages) {
            const figureMatches = page.text.match(/Figure\s+\d+[:.]\s*(.+)/gi);
            if (figureMatches) {
                figureMatches.forEach((match, index) => {
                    figures.push({
                        id: `fig_${page.pageNumber}_${index}`,
                        caption: match,
                        pageNumber: page.pageNumber,
                        boundingBox: { x: 0, y: 0, width: 100, height: 50 }, // Placeholder
                        references: []
                    });
                });
            }
        }
        return figures;
    }
    extractTables(parsed) {
        const tables = [];
        for (const page of parsed.pages) {
            const tableMatches = page.text.match(/Table\s+\d+[:.]\s*(.+)/gi);
            if (tableMatches) {
                tableMatches.forEach((match, index) => {
                    tables.push({
                        id: `table_${page.pageNumber}_${index}`,
                        caption: match,
                        pageNumber: page.pageNumber,
                        boundingBox: { x: 0, y: 0, width: 100, height: 50 }, // Placeholder
                        references: []
                    });
                });
            }
        }
        return tables;
    }
    extractEquations(parsed) {
        const equations = [];
        for (const page of parsed.pages) {
            // Simple equation detection - look for mathematical expressions
            const equationMatches = page.text.match(/\$[^$]+\$|\\\[[^\]]+\\\]|Equation\s+\d+/gi);
            if (equationMatches) {
                equationMatches.forEach((match, index) => {
                    equations.push({
                        id: `eq_${page.pageNumber}_${index}`,
                        content: match,
                        pageNumber: page.pageNumber,
                        references: []
                    });
                });
            }
        }
        return equations;
    }
    updateSectionBoundaries(sections, totalLines) {
        sections.sort((a, b) => a.startLine - b.startLine);
        for (let i = 0; i < sections.length; i++) {
            const currentSection = sections[i];
            const nextSection = sections[i + 1];
            if (nextSection) {
                currentSection.endLine = nextSection.startLine - 1;
            }
            else {
                currentSection.endLine = totalLines - 1;
            }
        }
    }
    // Semantic Chunking Methods
    async createSemanticChunks(documentId, structure, options) {
        const chunks = [];
        for (const section of structure.sections) {
            const sectionChunks = await this.chunkSectionSemantically(documentId, section, options);
            chunks.push(...sectionChunks);
        }
        return chunks;
    }
    async chunkSectionSemantically(documentId, section, options) {
        const chunks = [];
        if (section.content.length <= options.chunkSize) {
            // Section fits in one chunk
            chunks.push(this.createSemanticChunk(documentId, section, section.content, 0));
        }
        else {
            // Split by sentences and group semantically
            const sentences = this.sentenceTokenizer.tokenize(section.content);
            const sentenceGroups = this.groupSentencesSemantically(sentences, options.chunkSize);
            sentenceGroups.forEach((group, index) => {
                const chunkContent = group.join(' ');
                chunks.push(this.createSemanticChunk(documentId, section, chunkContent, index));
            });
        }
        // Recursively process child sections
        for (const childSection of section.children) {
            const childChunks = await this.chunkSectionSemantically(documentId, childSection, options);
            chunks.push(...childChunks);
        }
        return chunks;
    }
    groupSentencesSemantically(sentences, maxChunkSize) {
        const groups = [];
        let currentGroup = [];
        let currentSize = 0;
        for (const sentence of sentences) {
            const sentenceSize = sentence.length;
            if (currentSize + sentenceSize > maxChunkSize && currentGroup.length > 0) {
                groups.push(currentGroup);
                currentGroup = [sentence];
                currentSize = sentenceSize;
            }
            else {
                currentGroup.push(sentence);
                currentSize += sentenceSize;
            }
        }
        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }
        return groups;
    }
    createSemanticChunk(documentId, section, content, chunkIndex) {
        const boundingBox = {
            x: 0,
            y: 0,
            width: 100,
            height: content.length * 0.1
        };
        const metadata = {
            pageNumber: section.pageStart,
            sectionTitle: section.title,
            sectionType: section.type,
            startPosition: chunkIndex * 1000,
            endPosition: (chunkIndex + 1) * 1000,
            boundingBox,
            confidence: 0.9
        };
        return {
            id: (0, types_2.generateId)(),
            documentId,
            content,
            metadata,
            createdAt: new Date()
        };
    }
    // Document fingerprinting for caching
    generateDocumentFingerprint(filePath, content) {
        return new Promise((resolve) => {
            const hash = crypto_1.default.createHash('sha256');
            hash.update(content);
            hash.update(filePath);
            hash.update(new Date().toISOString().split('T')[0]); // Date component for cache invalidation
            resolve(hash.digest('hex'));
        });
    }
}
exports.PDFProcessor = PDFProcessor;
exports.pdfProcessor = new PDFProcessor();
