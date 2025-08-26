import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, AlertCircle, RotateCcw, Book } from 'lucide-react';
import { EducationLevel } from '@/types';
import clsx from 'clsx';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [sessionId] = useState(() => `${documentId}-${Date.now()}`);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const welcomeMessage: ChatMessage = {
      id: 'welcome-message',
      role: 'assistant',
      content: `Hello! I'm your AI research assistant. How can I help you understand this paper at the ${educationLevel.replace('_', ' ')} level?`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, [educationLevel]);

  useEffect(() => {
    if (selectedText) {
      setInputValue(prev => prev ? `${prev}\n\n> ${selectedText}` : `> ${selectedText}`);
      inputRef.current?.focus();
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

    try {
      const context = messages.slice(-10).map(msg => ({ role: msg.role, content: msg.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, sessionId, message: userMessage.content, educationLevel, context })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message?.content || 'I couldn\'t generate a response.',
        timestamp: new Date(),
        citations: data.sources || data.citations
      };

      setMessages(prev => prev.slice(0, -1).concat([assistantMessage]));

    } catch (err) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'An error occurred. Please try again.',
        timestamp: new Date(),
        error: true
      };
      setMessages(prev => prev.slice(0, -1).concat([errorMessage]));
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, documentId, educationLevel, messages, sessionId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const clearChat = useCallback(() => {
    const welcomeMessage: ChatMessage = {
      id: 'welcome-message-reset',
      role: 'assistant',
      content: `Chat cleared. How can I help you at the ${educationLevel.replace('_', ' ')} level?`,
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  }, [educationLevel]);

  return (
    <div className={clsx('flex flex-col h-full bg-white', className)}>
      <div className="flex items-center justify-between border-b border-secondary-200 px-4 py-3">
        <div className="flex items-center space-x-3">
          <Bot className="w-6 h-6 text-primary-600" />
          <div>
            <h3 className="font-semibold text-secondary-900">AI Assistant</h3>
            <p className="text-xs text-secondary-600 capitalize">
              {educationLevel.replace('_', ' ')} Level
            </p>
          </div>
        </div>
        <button onClick={clearChat} className="btn btn-ghost btn-sm" title="Clear Chat">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((message) => (
          <div key={message.id} className={clsx('flex items-start', message.role === 'user' && 'justify-end')}>
            <div className={clsx('max-w-[85%] rounded-lg px-4 py-3', {
              'bg-primary-600 text-white': message.role === 'user',
              'bg-secondary-100 text-secondary-900': message.role === 'assistant' && !message.error,
              'bg-error-50 text-error-900 border border-error-200': message.error,
            })}>
              {message.isLoading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {message.content}
                  {message.citations && message.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-secondary-200">
                      <h4 className="text-xs font-semibold mb-1">Sources:</h4>
                      <div className="flex flex-wrap gap-2">
                        {message.citations.map((citation, index) => (
                          <div key={index} className="flex items-center bg-secondary-200 rounded-full px-2 py-1 text-xs">
                            <Book className="w-3 h-3 mr-1.5" />
                            Page {citation.pageNumber}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-secondary-200 p-4">
        <div className="flex items-end space-x-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            rows={Math.min(inputValue.split('\n').length, 5)}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="btn btn-primary p-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
