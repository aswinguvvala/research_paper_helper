import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EducationLevel } from '@/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  error?: boolean;
  citations?: Array<{
    pageNumber: number;
    confidence: number;
  }>;
}

export interface ChatInterfaceProps {
  documentId: string;
  educationLevel: EducationLevel;
  selectedText?: string;
  className?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  documentId,
  educationLevel,
  selectedText,
  className = ''
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Generate unique session ID for this document chat session
  const [sessionId] = useState(() => {
    return `${documentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Add welcome message on mount
  useEffect(() => {
    const welcomeMessage: ChatMessage = {
      id: 'welcome-message',
      role: 'assistant',
      content: `Hello! I'm your AI research assistant. I can help you understand this research paper at the ${educationLevel.replace('_', ' ')} level. 

You can:
- Ask questions about the paper's content
- Highlight text in the PDF to get contextual explanations
- Request summaries of specific sections
- Get help understanding complex concepts

How can I help you today?`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
    
    // Log session initialization
    console.log('💬 Chat session initialized:', { sessionId, documentId, educationLevel });
  }, [educationLevel]);

  // Handle text selection from PDF (via popup actions)
  useEffect(() => {
    console.log('🎬 ChatInterface: selectedText changed', { selectedText: selectedText?.substring(0, 50) + '...', hasSelectedText: !!selectedText });
    
    try {
      if (selectedText && typeof selectedText === 'string' && selectedText.includes('Can you')) {
        console.log('📝 ChatInterface: Auto-filling input with pre-formatted question');
        // Only auto-fill if it's a pre-formatted question from popup actions
        setInputValue(selectedText);
        
        // Auto-focus input for immediate sending
        setTimeout(() => {
          try {
            if (inputRef.current) {
              inputRef.current.focus();
              console.log('✅ ChatInterface: Input focused successfully');
            } else {
              console.warn('⚠️ ChatInterface: Input ref not available for focus');
            }
          } catch (focusError) {
            console.error('❌ ChatInterface: Error focusing input', focusError);
          }
        }, 100);
      } else if (selectedText) {
        console.log('📝 ChatInterface: selectedText received but not auto-filling (not a pre-formatted question)');
      }
    } catch (error) {
      console.error('❌ ChatInterface: Error in selectedText useEffect', { error, selectedText });
    }
  }, [selectedText]);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    const loadingMessage: ChatMessage = {
      id: `loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      // Format conversation history as context for backend
      const context = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }));

      const requestBody = {
        documentId,
        sessionId,
        message: userMessage.content,
        educationLevel,
        context,
        highlightedText: selectedText || undefined
      };

      console.log('📤 Sending chat request:', { 
        sessionId, 
        message: userMessage.content.substring(0, 50) + '...', 
        educationLevel,
        contextLength: context.length,
        hasHighlightedText: !!selectedText
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from server');
      }

      // Extract content from the proper response structure: data.message.content
      let content: string;
      if (data.message && typeof data.message === 'object' && typeof data.message.content === 'string') {
        content = data.message.content;
      } else if (data.response && typeof data.response === 'string') {
        // Fallback for old response format
        content = data.response;
      } else if (data.answer && typeof data.answer === 'string') {
        // Another fallback
        content = data.answer;
      } else {
        content = 'I apologize, but I couldn\'t generate a response.';
        console.warn('Unexpected response structure:', data);
      }

      // Ensure content is always a string to prevent React child object errors
      if (typeof content !== 'string') {
        console.error('❌ Content is not a string:', { content, type: typeof content });
        content = String(content) || 'Error: Invalid response format';
      }

      // Extract citations from sources
      let citations = undefined;
      if (data.sources && Array.isArray(data.sources)) {
        citations = data.sources.map((source: any) => ({
          pageNumber: source.metadata?.pageNumber || source.pageNumber || 1,
          confidence: source.metadata?.confidence || source.confidence || 0.8
        }));
      } else if (data.citations && Array.isArray(data.citations)) {
        // Fallback for direct citations
        citations = data.citations;
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: content,
        timestamp: new Date(),
        citations: citations
      };

      // Replace loading message with actual response
      setMessages(prev => prev.slice(0, -1).concat([assistantMessage]));

    } catch (err) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error while processing your question. Please try again.',
        timestamp: new Date(),
        error: true
      };

      setMessages(prev => prev.slice(0, -1).concat([errorMessage]));
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, documentId, educationLevel, messages, selectedText]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    // Re-add welcome message
    const welcomeMessage: ChatMessage = {
      id: 'welcome-message-reset',
      role: 'assistant',
      content: `Chat cleared! I'm ready to help you understand this research paper at the ${educationLevel.replace('_', ' ')} level. What would you like to know?`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, [educationLevel]);

  const formatEducationLevel = (level: EducationLevel): string => {
    return level.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-secondary-200 px-4 py-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-secondary-900">AI Assistant</h3>
            <p className="text-xs text-secondary-600">
              Level: {formatEducationLevel(educationLevel)}
            </p>
          </div>
        </div>
        
        <button
          onClick={clearChat}
          className="btn btn-secondary btn-sm"
          title="Clear Chat"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`flex items-start space-x-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  {message.isLoading ? (
                    <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                  ) : message.error ? (
                    <AlertCircle className="w-4 h-4 text-error-600" />
                  ) : (
                    <Bot className="w-4 h-4 text-primary-600" />
                  )}
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : message.error
                    ? 'bg-error-50 text-error-900 border border-error-200'
                    : 'bg-secondary-100 text-secondary-900'
                }`}
              >
                {message.isLoading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {typeof message.content === 'string' ? message.content : (
                        typeof message.content === 'object' ? 
                          JSON.stringify(message.content) : 
                          String(message.content)
                      )}
                    </div>
                    
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-secondary-200">
                        <div className="text-xs text-secondary-600">
                          <span className="font-medium">Sources:</span>
                          {message.citations.map((citation, index) => (
                            <span key={index} className="ml-1">
                              Page {citation.pageNumber}
                              {index < message.citations!.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                <div className="text-xs opacity-60 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 bg-secondary-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-secondary-600" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-secondary-200 p-4">
        {error && (
          <div className="mb-3 p-2 bg-error-50 border border-error-200 rounded-md">
            <p className="text-error-700 text-sm">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              {error}
            </p>
          </div>
        )}

        {selectedText && (
          <div className="mb-3 p-3 bg-gradient-to-r from-primary-50 to-blue-50 border-l-4 border-primary-400 rounded-md shadow-sm animate-pulse">
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 animate-pulse"></div>
              <div className="flex-1">
                <p className="text-primary-800 text-sm font-medium mb-1">
                  📝 Text Selected & Ready for AI Analysis
                </p>
                <p className="text-primary-700 text-xs leading-relaxed bg-white bg-opacity-60 rounded px-2 py-1">
                  "{selectedText.substring(0, 120)}{selectedText.length > 120 ? '...' : ''}"
                </p>
                <p className="text-primary-600 text-xs mt-1 italic">
                  ✨ Ask a question about this text or press Enter to send
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-end space-x-2">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about the research paper..."
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              rows={inputValue.includes('\n') ? Math.min(inputValue.split('\n').length, 4) : 1}
              disabled={isLoading}
            />
          </div>
          
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="btn btn-primary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="text-xs text-secondary-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;