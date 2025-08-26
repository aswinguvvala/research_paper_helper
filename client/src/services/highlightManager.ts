export interface Highlight {
  id: string;
  documentId: string;
  pageNumber: number;
  selectedText: string;
  startPosition: number;
  endPosition: number;
  color: HighlightColor;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink' | 'orange' | 'purple' | 'red';

export interface HighlightCreateRequest {
  documentId: string;
  pageNumber: number;
  selectedText: string;
  startPosition: number;
  endPosition: number;
  color: HighlightColor;
  notes?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface HighlightUpdateRequest {
  color?: HighlightColor;
  notes?: string;
}

export class HighlightManager {
  private static instance: HighlightManager;
  private highlights: Map<string, Highlight[]> = new Map(); // documentId -> highlights
  private eventListeners: Map<string, Set<Function>> = new Map();

  static getInstance(): HighlightManager {
    if (!HighlightManager.instance) {
      HighlightManager.instance = new HighlightManager();
    }
    return HighlightManager.instance;
  }

  private constructor() {
    this.loadHighlightsFromStorage();
  }

  // Color configurations
  getHighlightColors(): { [key in HighlightColor]: { background: string; border: string; text: string } } {
    return {
      yellow: { background: 'rgba(255, 235, 59, 0.4)', border: '#FBC02D', text: '#F57F17' },
      blue: { background: 'rgba(33, 150, 243, 0.3)', border: '#1976D2', text: '#0D47A1' },
      green: { background: 'rgba(76, 175, 80, 0.3)', border: '#388E3C', text: '#1B5E20' },
      pink: { background: 'rgba(233, 30, 99, 0.3)', border: '#C2185B', text: '#880E4F' },
      orange: { background: 'rgba(255, 152, 0, 0.3)', border: '#F57C00', text: '#E65100' },
      purple: { background: 'rgba(156, 39, 176, 0.3)', border: '#7B1FA2', text: '#4A148C' },
      red: { background: 'rgba(244, 67, 54, 0.3)', border: '#D32F2F', text: '#B71C1C' }
    };
  }

  // Event handling for real-time updates
  addEventListener(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  removeEventListener(event: string, callback: Function): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach(callback => callback(data));
  }

  // Core highlight operations
  async createHighlight(request: HighlightCreateRequest): Promise<Highlight> {
    const id = this.generateId();
    const now = new Date();
    
    const highlight: Highlight = {
      id,
      documentId: request.documentId,
      pageNumber: request.pageNumber,
      selectedText: request.selectedText,
      startPosition: request.startPosition,
      endPosition: request.endPosition,
      color: request.color,
      notes: request.notes,
      createdAt: now,
      updatedAt: now,
      boundingBox: request.boundingBox
    };

    // Add to local storage
    if (!this.highlights.has(request.documentId)) {
      this.highlights.set(request.documentId, []);
    }
    this.highlights.get(request.documentId)!.push(highlight);
    
    // Persist to storage
    this.saveHighlightsToStorage();
    
    // Try to persist to backend (non-blocking)
    this.persistToBackend(highlight).catch(error => {
      console.warn('Failed to persist highlight to backend:', error);
    });

    // Emit event
    this.emit('highlight-created', highlight);

    console.log('Highlight created:', { id, documentId: request.documentId, color: request.color, text: request.selectedText.substring(0, 50) + '...' });
    
    return highlight;
  }

  async updateHighlight(highlightId: string, updates: HighlightUpdateRequest): Promise<Highlight> {
    const highlight = this.findHighlightById(highlightId);
    if (!highlight) {
      throw new Error('Highlight not found');
    }

    // Update properties
    if (updates.color) highlight.color = updates.color;
    if (updates.notes !== undefined) highlight.notes = updates.notes;
    highlight.updatedAt = new Date();

    // Persist changes
    this.saveHighlightsToStorage();
    this.persistToBackend(highlight).catch(error => {
      console.warn('Failed to update highlight in backend:', error);
    });

    // Emit event
    this.emit('highlight-updated', highlight);

    console.log('Highlight updated:', { id: highlightId, updates });
    
    return highlight;
  }

  async deleteHighlight(highlightId: string): Promise<void> {
    const highlight = this.findHighlightById(highlightId);
    if (!highlight) {
      throw new Error('Highlight not found');
    }

    // Remove from local storage
    const documentHighlights = this.highlights.get(highlight.documentId);
    if (documentHighlights) {
      const index = documentHighlights.findIndex(h => h.id === highlightId);
      if (index > -1) {
        documentHighlights.splice(index, 1);
      }
    }

    // Persist changes
    this.saveHighlightsToStorage();
    this.deleteFromBackend(highlightId).catch(error => {
      console.warn('Failed to delete highlight from backend:', error);
    });

    // Emit event
    this.emit('highlight-deleted', { id: highlightId, documentId: highlight.documentId });

    console.log('Highlight deleted:', { id: highlightId, documentId: highlight.documentId });
  }

  // Query operations
  getHighlightsForDocument(documentId: string): Highlight[] {
    return this.highlights.get(documentId) || [];
  }

  getHighlightsForPage(documentId: string, pageNumber: number): Highlight[] {
    const documentHighlights = this.highlights.get(documentId) || [];
    return documentHighlights.filter(h => h.pageNumber === pageNumber);
  }

  findHighlightById(highlightId: string): Highlight | null {
    for (const highlights of this.highlights.values()) {
      const highlight = highlights.find(h => h.id === highlightId);
      if (highlight) return highlight;
    }
    return null;
  }

  // Statistics and analytics
  getHighlightStats(documentId: string): {
    total: number;
    byColor: Record<HighlightColor, number>;
    byPage: Record<number, number>;
    withNotes: number;
  } {
    const highlights = this.getHighlightsForDocument(documentId);
    
    const byColor: Record<HighlightColor, number> = {
      yellow: 0, blue: 0, green: 0, pink: 0, orange: 0, purple: 0, red: 0
    };
    
    const byPage: Record<number, number> = {};
    let withNotes = 0;

    highlights.forEach(highlight => {
      byColor[highlight.color]++;
      byPage[highlight.pageNumber] = (byPage[highlight.pageNumber] || 0) + 1;
      if (highlight.notes) withNotes++;
    });

    return {
      total: highlights.length,
      byColor,
      byPage,
      withNotes
    };
  }

  // Storage operations
  private loadHighlightsFromStorage(): void {
    try {
      const stored = localStorage.getItem('pdf-highlights');
      if (stored) {
        const data = JSON.parse(stored);
        this.highlights.clear();
        
        Object.entries(data).forEach(([documentId, highlights]) => {
          this.highlights.set(documentId, (highlights as any[]).map(h => ({
            ...h,
            createdAt: new Date(h.createdAt),
            updatedAt: new Date(h.updatedAt)
          })));
        });
        
        console.log('Loaded highlights from storage:', this.highlights.size, 'documents');
      }
    } catch (error) {
      console.error('Failed to load highlights from storage:', error);
    }
  }

  private saveHighlightsToStorage(): void {
    try {
      const data: Record<string, Highlight[]> = {};
      this.highlights.forEach((highlights, documentId) => {
        data[documentId] = highlights;
      });
      
      localStorage.setItem('pdf-highlights', JSON.stringify(data));
      console.log('Saved highlights to storage');
    } catch (error) {
      console.error('Failed to save highlights to storage:', error);
    }
  }

  // Backend integration (API calls)
  private async persistToBackend(highlight: Highlight): Promise<void> {
    try {
      const response = await fetch(`/api/documents/${highlight.documentId}/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(highlight)
      });
      
      if (!response.ok) {
        throw new Error(`Backend persistence failed: ${response.statusText}`);
      }
    } catch (error) {
      console.warn('Backend persistence failed, using local storage only:', error);
      throw error;
    }
  }

  private async deleteFromBackend(highlightId: string): Promise<void> {
    try {
      const response = await fetch(`/api/highlights/${highlightId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Backend deletion failed: ${response.statusText}`);
      }
    } catch (error) {
      console.warn('Backend deletion failed:', error);
      throw error;
    }
  }

  // Utility methods
  private generateId(): string {
    return 'highlight_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Export/Import functionality
  exportHighlights(documentId: string): string {
    const highlights = this.getHighlightsForDocument(documentId);
    return JSON.stringify(highlights, null, 2);
  }

  async importHighlights(documentId: string, jsonData: string): Promise<void> {
    try {
      const highlights = JSON.parse(jsonData) as Highlight[];
      
      // Validate format
      highlights.forEach(h => {
        if (!h.selectedText || !h.color || typeof h.pageNumber !== 'number') {
          throw new Error('Invalid highlight format');
        }
      });

      // Clear existing highlights for document
      this.highlights.set(documentId, []);
      
      // Add imported highlights
      for (const highlight of highlights) {
        await this.createHighlight({
          documentId,
          pageNumber: highlight.pageNumber,
          selectedText: highlight.selectedText,
          startPosition: highlight.startPosition,
          endPosition: highlight.endPosition,
          color: highlight.color,
          notes: highlight.notes,
          boundingBox: highlight.boundingBox
        });
      }

      console.log('Imported highlights:', highlights.length);
    } catch (error) {
      console.error('Failed to import highlights:', error);
      throw new Error('Invalid highlight data format');
    }
  }

  // Clean up resources
  destroy(): void {
    this.eventListeners.clear();
    this.highlights.clear();
  }
}

export const highlightManager = HighlightManager.getInstance();