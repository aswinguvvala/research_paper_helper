import pdfParse from 'pdf-parse';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as natural from 'natural';
import nlp from 'compromise';

import { 
  DocumentMetadata, 
  DocumentChunk, 
  SectionType, 
  ChunkMetadata,
  BoundingBox 
} from '../../types';
import { generateId } from '../../types';
import logger from '../../utils/logger';

export interface ProcessingOptions {
  chunkSize: number;
  chunkOverlap: number;
  preserveStructure: boolean;
  extractMetadata: boolean;
}

export interface ParsedDocument {
  text: string;
  numPages: number;
  info: any;
  metadata: any;
  pages: ParsedPage[];
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  lines: TextLine[];
  sections: DetectedSection[];
}

export interface TextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
}

export interface DetectedSection {
  type: SectionType;
  title: string;
  startLine: number;
  endLine: number;
  confidence: number;
  level: number; // Hierarchical level (1 = main section, 2 = subsection, etc.)
  parentSection?: string; // Reference to parent section title
  children: DetectedSection[]; // Child sections
}

export interface DocumentStructure {
  title?: string;
  authors: string[];
  abstract?: string;
  sections: HierarchicalSection[];
  citations: CitationInfo[];
  figures: FigureInfo[];
  tables: TableInfo[];
  equations: EquationInfo[];
}

export interface HierarchicalSection {
  id: string;
  type: SectionType;
  title: string;
  level: number;
  content: string;
  pageStart: number;
  pageEnd: number;
  children: HierarchicalSection[];
  parent?: string;
  keywords: string[];
  sentenceCount: number;
  readabilityScore: number;
}

export interface CitationInfo {
  id: string;
  text: string;
  pageNumber: number;
  inTextReferences: string[]; // References within the document text
}

export interface FigureInfo {
  id: string;
  caption: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  references: string[]; // Where it's referenced in text
}

export interface TableInfo {
  id: string;
  caption: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  references: string[];
}

export interface EquationInfo {
  id: string;
  content: string;
  pageNumber: number;
  references: string[];
}

export class PDFProcessor {
  private readonly defaultOptions: ProcessingOptions = {
    chunkSize: 1000,
    chunkOverlap: 200,
    preserveStructure: true,
    extractMetadata: true
  };

  private readonly sentenceTokenizer = new natural.SentenceTokenizer();
  private readonly wordTokenizer = new natural.WordTokenizer();
  private readonly stemmer = natural.PorterStemmer;

  async processDocument(
    filePath: string, 
    filename: string,
    options: Partial<ProcessingOptions> = {}
  ): Promise<{ metadata: DocumentMetadata; chunks: DocumentChunk[] }> {
    const opts = { ...this.defaultOptions, ...options };
    
    try {
      logger.info('Starting PDF processing', { filename, filePath });
      
      // Parse PDF
      const parsed = await this.parsePDF(filePath);
      
      // Extract document metadata
      const metadata = await this.extractDocumentMetadata(
        filename, 
        filePath, 
        parsed
      );
      
      // Process into chunks
      const chunks = await this.createChunks(metadata.id, parsed, opts);
      
      logger.info('PDF processing completed', {
        documentId: metadata.id,
        totalPages: metadata.totalPages,
        totalChunks: chunks.length
      });
      
      return { metadata, chunks };
      
    } catch (error) {
      logger.error('PDF processing failed', { error, filename });
      throw error;
    }
  }

  private async parsePDF(filePath: string): Promise<ParsedDocument> {
    try {
      const buffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(buffer, {
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
    } catch (error) {
      logger.error('PDF parsing failed', { error, filePath });
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  private async parsePages(buffer: Buffer): Promise<ParsedPage[]> {
    // This is a simplified implementation
    // In a production system, you'd use a more sophisticated PDF parser
    // like PDF2pic with OCR or pdf-lib for better structure detection
    
    try {
      const pdfData = await pdfParse(buffer);
      const pageTexts = this.splitTextByPages(pdfData.text, pdfData.numpages);
      
      return pageTexts.map((text, index) => ({
        pageNumber: index + 1,
        text,
        lines: this.extractTextLines(text),
        sections: this.detectSections(text, index + 1)
      }));
    } catch (error) {
      logger.error('Page parsing failed', { error });
      throw error;
    }
  }

  private splitTextByPages(text: string, numPages: number): string[] {
    // Simple page splitting - in production, use better PDF parsing
    const lines = text.split('\n');
    const linesPerPage = Math.ceil(lines.length / numPages);
    const pages: string[] = [];
    
    for (let i = 0; i < numPages; i++) {
      const startLine = i * linesPerPage;
      const endLine = Math.min((i + 1) * linesPerPage, lines.length);
      pages.push(lines.slice(startLine, endLine).join('\n'));
    }
    
    return pages;
  }

  private extractTextLines(pageText: string): TextLine[] {
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

  private detectSections(pageText: string, pageNumber: number): DetectedSection[] {
    const sections: DetectedSection[] = [];
    const lines = pageText.split('\n');
    
    // Academic paper section patterns
    const sectionPatterns = [
      { pattern: /^(abstract|summary)$/i, type: SectionType.ABSTRACT, confidence: 0.9 },
      { pattern: /^(introduction|intro)$/i, type: SectionType.INTRODUCTION, confidence: 0.9 },
      { pattern: /^(methodology|methods|approach)$/i, type: SectionType.METHODOLOGY, confidence: 0.9 },
      { pattern: /^(results|findings)$/i, type: SectionType.RESULTS, confidence: 0.9 },
      { pattern: /^(discussion|analysis)$/i, type: SectionType.DISCUSSION, confidence: 0.8 },
      { pattern: /^(conclusion|conclusions)$/i, type: SectionType.CONCLUSION, confidence: 0.9 },
      { pattern: /^(references|bibliography)$/i, type: SectionType.REFERENCES, confidence: 0.9 },
      { pattern: /^(figure|fig\.?\s+\d+)/i, type: SectionType.FIGURE, confidence: 0.8 },
      { pattern: /^(table|tbl\.?\s+\d+)/i, type: SectionType.TABLE, confidence: 0.8 }
    ];

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;

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
          type: SectionType.TITLE,
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
      } else {
        section.endLine = lines.length - 1;
      }
    });

    return sections;
  }

  private looksLikeTitle(text: string): boolean {
    // Heuristics for title detection
    if (text.length < 10 || text.length > 200) return false;
    if (text.includes('.') && !text.endsWith('.')) return false;
    
    const words = text.split(' ');
    if (words.length < 3) return false;
    
    // Check if most words are capitalized (title case)
    const capitalizedWords = words.filter(word => 
      word.length > 0 && word[0] === word[0].toUpperCase()
    );
    
    return capitalizedWords.length / words.length > 0.6;
  }

  private async extractDocumentMetadata(
    filename: string,
    filePath: string,
    parsed: ParsedDocument
  ): Promise<DocumentMetadata> {
    const fileStats = await fs.stat(filePath);
    
    // Extract title from first page or PDF metadata
    let title = parsed.info?.Title || null;
    if (!title && parsed.pages.length > 0) {
      const titleSections = parsed.pages[0].sections.filter(s => s.type === SectionType.TITLE);
      title = titleSections.length > 0 ? titleSections[0].title : null;
    }
    
    // Extract authors from PDF metadata or first page
    let authors: string[] = [];
    if (parsed.info?.Author) {
      authors = [parsed.info.Author];
    }
    
    // Extract abstract
    let abstract: string | undefined;
    for (const page of parsed.pages) {
      const abstractSection = page.sections.find(s => s.type === SectionType.ABSTRACT);
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
      id: generateId(),
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

  private async createChunks(
    documentId: string,
    parsed: ParsedDocument,
    options: ProcessingOptions
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    for (const page of parsed.pages) {
      const pageChunks = await this.chunkPage(documentId, page, options);
      chunks.push(...pageChunks);
    }
    
    return chunks;
  }

  private async chunkPage(
    documentId: string,
    page: ParsedPage,
    options: ProcessingOptions
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    if (options.preserveStructure) {
      // Chunk by detected sections
      for (const section of page.sections) {
        const sectionChunks = await this.chunkSection(
          documentId, 
          page, 
          section, 
          options
        );
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
        const unsectionedChunks = await this.chunkText(
          documentId,
          unsectionedText,
          page.pageNumber,
          SectionType.OTHER,
          options
        );
        chunks.push(...unsectionedChunks);
      }
    } else {
      // Simple text-based chunking
      const textChunks = await this.chunkText(
        documentId,
        page.text,
        page.pageNumber,
        SectionType.OTHER,
        options
      );
      chunks.push(...textChunks);
    }
    
    return chunks;
  }

  private async chunkSection(
    documentId: string,
    page: ParsedPage,
    section: DetectedSection,
    options: ProcessingOptions
  ): Promise<DocumentChunk[]> {
    const lines = page.text.split('\n');
    const sectionText = lines
      .slice(section.startLine, section.endLine + 1)
      .join('\n')
      .trim();
    
    return this.chunkText(
      documentId,
      sectionText,
      page.pageNumber,
      section.type,
      options,
      section.title
    );
  }

  private async chunkText(
    documentId: string,
    text: string,
    pageNumber: number,
    sectionType: SectionType,
    options: ProcessingOptions,
    sectionTitle?: string
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    if (text.length <= options.chunkSize) {
      // Text fits in one chunk
      chunks.push(this.createChunk(
        documentId,
        text,
        pageNumber,
        sectionType,
        sectionTitle,
        0,
        text.length
      ));
    } else {
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
          chunks.push(this.createChunk(
            documentId,
            chunkText,
            pageNumber,
            sectionType,
            sectionTitle,
            start,
            end
          ));
        }
        
        // Move start position with overlap
        start = Math.max(start + options.chunkSize - options.chunkOverlap, end);
        chunkIndex++;
      }
    }
    
    return chunks;
  }

  private findSentenceBreak(text: string, position: number): number {
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

  private createChunk(
    documentId: string,
    content: string,
    pageNumber: number,
    sectionType: SectionType,
    sectionTitle: string | undefined,
    startPosition: number,
    endPosition: number
  ): DocumentChunk {
    // Create bounding box (simplified - in production, use actual PDF coordinates)
    const boundingBox: BoundingBox = {
      x: 0,
      y: startPosition * 0.1, // Estimated
      width: 100, // Percentage of page width
      height: (endPosition - startPosition) * 0.1
    };

    const metadata: ChunkMetadata = {
      pageNumber,
      sectionTitle,
      sectionType,
      startPosition,
      endPosition,
      boundingBox,
      confidence: 0.8 // Default confidence
    };

    return {
      id: generateId(),
      documentId,
      content,
      metadata,
      createdAt: new Date()
    };
  }

  async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.info('Cleaned up temporary file', { filePath });
    } catch (error) {
      logger.warn('Failed to cleanup temporary file', { error, filePath });
    }
  }

  // Advanced Document Structure Analysis
  async analyzeDocumentStructure(parsed: ParsedDocument): Promise<DocumentStructure> {
    logger.info('Analyzing document structure');
    
    const structure: DocumentStructure = {
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

  private async buildHierarchicalSections(parsed: ParsedDocument): Promise<HierarchicalSection[]> {
    const hierarchicalSections: HierarchicalSection[] = [];
    const sectionStack: HierarchicalSection[] = [];
    
    for (const page of parsed.pages) {
      const sections = this.detectAdvancedSections(page.text, page.pageNumber);
      
      for (const detectedSection of sections) {
        const section: HierarchicalSection = {
          id: generateId(),
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
        } else {
          hierarchicalSections.push(section);
        }

        sectionStack.push(section);
      }
    }

    return hierarchicalSections;
  }

  private detectAdvancedSections(pageText: string, pageNumber: number): DetectedSection[] {
    const sections: DetectedSection[] = [];
    const lines = pageText.split('\n');
    
    // Enhanced section patterns with hierarchy detection
    const sectionPatterns = [
      { pattern: /^(\d+\.?\s+)?(abstract|summary)$/i, type: SectionType.ABSTRACT, level: 1, confidence: 0.95 },
      { pattern: /^(\d+\.?\s+)?(introduction|intro)$/i, type: SectionType.INTRODUCTION, level: 1, confidence: 0.95 },
      { pattern: /^(\d+\.?\s+)?(related\s+work|literature\s+review|background)$/i, type: SectionType.OTHER, level: 1, confidence: 0.9 },
      { pattern: /^(\d+\.?\s+)?(methodology|methods|approach|framework)$/i, type: SectionType.METHODOLOGY, level: 1, confidence: 0.95 },
      { pattern: /^(\d+\.?\s+)?(results|findings|experiments?)$/i, type: SectionType.RESULTS, level: 1, confidence: 0.95 },
      { pattern: /^(\d+\.?\s+)?(discussion|analysis|evaluation)$/i, type: SectionType.DISCUSSION, level: 1, confidence: 0.9 },
      { pattern: /^(\d+\.?\s+)?(conclusion|conclusions|summary)$/i, type: SectionType.CONCLUSION, level: 1, confidence: 0.95 },
      { pattern: /^(\d+\.?\s+)?(references|bibliography|citations)$/i, type: SectionType.REFERENCES, level: 1, confidence: 0.95 },
      
      // Subsection patterns
      { pattern: /^(\d+\.\d+\.?\s+)(.+)$/i, type: SectionType.OTHER, level: 2, confidence: 0.8 },
      { pattern: /^(\d+\.\d+\.\d+\.?\s+)(.+)$/i, type: SectionType.OTHER, level: 3, confidence: 0.7 },
      
      // Figure and table patterns
      { pattern: /^(figure|fig\.?\s+\d+)/i, type: SectionType.FIGURE, level: 0, confidence: 0.9 },
      { pattern: /^(table|tbl\.?\s+\d+)/i, type: SectionType.TABLE, level: 0, confidence: 0.9 }
    ];

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;

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
          type: SectionType.TITLE,
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

  private extractSectionContent(pageText: string, section: DetectedSection): string {
    const lines = pageText.split('\n');
    return lines
      .slice(section.startLine + 1, section.endLine + 1)
      .join(' ')
      .trim();
  }

  private extractKeywords(content: string): string[] {
    if (!content || content.length < 10) return [];
    
    // Use compromise for better keyword extraction
    const doc = nlp(content);
    
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

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'can', 'cannot', 'would', 'could', 'should', 'may'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }

  private countSentences(content: string): number {
    if (!content) return 0;
    return this.sentenceTokenizer.tokenize(content).length;
  }

  private calculateReadabilityScore(content: string): number {
    if (!content || content.length < 10) return 0;
    
    // Simple Flesch Reading Ease approximation
    const sentences = this.sentenceTokenizer.tokenize(content);
    const words = this.wordTokenizer.tokenize(content);
    
    if (sentences.length === 0 || words.length === 0) return 0;
    
    const avgSentenceLength = words.length / sentences.length;
    const avgSyllables = this.estimateAverageSyllables(words);
    
    // Simplified Flesch formula
    const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllables);
    return Math.max(0, Math.min(100, score));
  }

  private estimateAverageSyllables(words: string[]): number {
    if (words.length === 0) return 0;
    
    const totalSyllables = words.reduce((sum, word) => {
      return sum + this.countSyllables(word);
    }, 0);
    
    return totalSyllables / words.length;
  }

  private countSyllables(word: string): number {
    if (!word) return 0;
    
    word = word.toLowerCase();
    let count = 0;
    let prevWasVowel = false;
    
    for (let i = 0; i < word.length; i++) {
      const isVowel = 'aeiouy'.includes(word[i]);
      if (isVowel && !prevWasVowel) count++;
      prevWasVowel = isVowel;
    }
    
    // Adjust for silent 'e'
    if (word.endsWith('e') && count > 1) count--;
    
    return Math.max(1, count);
  }

  private extractCitations(parsed: ParsedDocument): CitationInfo[] {
    const citations: CitationInfo[] = [];
    
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

  private extractFigures(parsed: ParsedDocument): FigureInfo[] {
    const figures: FigureInfo[] = [];
    
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

  private extractTables(parsed: ParsedDocument): TableInfo[] {
    const tables: TableInfo[] = [];
    
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

  private extractEquations(parsed: ParsedDocument): EquationInfo[] {
    const equations: EquationInfo[] = [];
    
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

  private updateSectionBoundaries(sections: DetectedSection[], totalLines: number): void {
    sections.sort((a, b) => a.startLine - b.startLine);
    
    for (let i = 0; i < sections.length; i++) {
      const currentSection = sections[i];
      const nextSection = sections[i + 1];
      
      if (nextSection) {
        currentSection.endLine = nextSection.startLine - 1;
      } else {
        currentSection.endLine = totalLines - 1;
      }
    }
  }

  // Semantic Chunking Methods
  async createSemanticChunks(
    documentId: string,
    structure: DocumentStructure,
    options: ProcessingOptions
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    for (const section of structure.sections) {
      const sectionChunks = await this.chunkSectionSemantically(
        documentId,
        section,
        options
      );
      chunks.push(...sectionChunks);
    }
    
    return chunks;
  }

  private async chunkSectionSemantically(
    documentId: string,
    section: HierarchicalSection,
    options: ProcessingOptions
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    
    if (section.content.length <= options.chunkSize) {
      // Section fits in one chunk
      chunks.push(this.createSemanticChunk(documentId, section, section.content, 0));
    } else {
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
      const childChunks = await this.chunkSectionSemantically(
        documentId,
        childSection,
        options
      );
      chunks.push(...childChunks);
    }
    
    return chunks;
  }

  private groupSentencesSemantically(sentences: string[], maxChunkSize: number): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let currentSize = 0;
    
    for (const sentence of sentences) {
      const sentenceSize = sentence.length;
      
      if (currentSize + sentenceSize > maxChunkSize && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [sentence];
        currentSize = sentenceSize;
      } else {
        currentGroup.push(sentence);
        currentSize += sentenceSize;
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  private createSemanticChunk(
    documentId: string,
    section: HierarchicalSection,
    content: string,
    chunkIndex: number
  ): DocumentChunk {
    const boundingBox: BoundingBox = {
      x: 0,
      y: 0,
      width: 100,
      height: content.length * 0.1
    };

    const metadata: ChunkMetadata = {
      pageNumber: section.pageStart,
      sectionTitle: section.title,
      sectionType: section.type,
      startPosition: chunkIndex * 1000,
      endPosition: (chunkIndex + 1) * 1000,
      boundingBox,
      confidence: 0.9
    };

    return {
      id: generateId(),
      documentId,
      content,
      metadata,
      createdAt: new Date()
    };
  }

  // Document fingerprinting for caching
  generateDocumentFingerprint(filePath: string, content: string): Promise<string> {
    return new Promise((resolve) => {
      const hash = crypto.createHash('sha256');
      hash.update(content);
      hash.update(filePath);
      hash.update(new Date().toISOString().split('T')[0]); // Date component for cache invalidation
      resolve(hash.digest('hex'));
    });
  }
}

export const pdfProcessor = new PDFProcessor();