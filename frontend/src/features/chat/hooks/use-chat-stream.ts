/**
 * Chat Stream Hook
 * 
 * AgentCore Runtime へのストリーミングチャットを管理する React Hook。
 * AWS SDK を使用して直接 AgentCore を呼び出す。
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AgentCoreClient,
  StreamChunk,
  InvokeParams,
  InvokeResponse,
  AgentCoreConfig,
  RAGSource,
} from '../api/agentcore-client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolUses?: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: string;
  }>;
  sources?: RAGSource[];
  tokensUsed?: number;
  latencyMs?: number;
}

export interface UseChatStreamOptions {
  /** AgentCore クライアント設定 */
  config: AgentCoreConfig;
  /** セッション ID */
  sessionId: string;
  /** ユーザー ID */
  userId: string;
  /** テナント ID (オプション) */
  tenantId?: string;
  /** メッセージ受信時のコールバック */
  onMessage?: (message: ChatMessage) => void;
  /** エラー発生時のコールバック */
  onError?: (error: Error) => void;
  /** ストリーミング完了時のコールバック */
  onComplete?: (response: InvokeResponse) => void;
}

export interface UseChatStreamReturn {
  /** メッセージ履歴 */
  messages: ChatMessage[];
  /** ストリーミング中かどうか */
  isStreaming: boolean;
  /** 現在のストリーミングテキスト */
  streamingText: string;
  /** エラー */
  error: Error | null;
  /** メッセージを送信 */
  sendMessage: (content: string, context?: Record<string, unknown>) => Promise<void>;
  /** メッセージをクリア */
  clearMessages: () => void;
  /** エラーをクリア */
  clearError: () => void;
  /** 最後のアシスタントメッセージを再生成 */
  regenerate: () => Promise<void>;
}

/**
 * チャットストリーミング Hook
 */
export function useChatStream(options: UseChatStreamOptions): UseChatStreamReturn {
  const {
    config,
    sessionId,
    userId,
    tenantId,
    onMessage,
    onError,
    onComplete,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<AgentCoreClient | null>(null);
  const lastUserMessageRef = useRef<string>('');
  const currentToolUsesRef = useRef<ChatMessage['toolUses']>([]);
  const currentSourcesRef = useRef<RAGSource[]>([]);

  // クライアント初期化
  useEffect(() => {
    clientRef.current = new AgentCoreClient(config);
    return () => {
      // クリーンアップ
    };
  }, [config]);

  /**
   * ユニークID生成
   */
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * ストリーミングでメッセージを送信
   */
  const sendWithStream = useCallback(
    async (prompt: string, context?: Record<string, unknown>) => {
      if (!clientRef.current) return;

      const params: InvokeParams = {
        sessionId,
        userId,
        tenantId,
        prompt,
        context,
      };

      let accumulatedText = '';
      currentToolUsesRef.current = [];
      currentSourcesRef.current = [];

      for await (const chunk of clientRef.current.stream(params)) {
        switch (chunk.type) {
          case 'text':
            accumulatedText += chunk.content || '';
            setStreamingText(accumulatedText);
            break;

          case 'tool_use':
            currentToolUsesRef.current = [
              ...(currentToolUsesRef.current || []),
              {
                name: chunk.toolName || '',
                input: chunk.toolInput || {},
              },
            ];
            break;

          case 'tool_result':
            if (currentToolUsesRef.current && currentToolUsesRef.current.length > 0) {
              const lastTool = currentToolUsesRef.current[currentToolUsesRef.current.length - 1];
              lastTool.result = chunk.toolResult;
            }
            break;

          case 'sources':
            currentSourcesRef.current = chunk.sources || [];
            break;

          case 'end':
            // endチャンクにsourcesが含まれている場合はそちらを優先
            const sources = currentSourcesRef.current;
            
            const assistantMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: accumulatedText,
              timestamp: new Date(),
              toolUses: currentToolUsesRef.current,
              sources: sources.length > 0 ? sources : undefined,
              tokensUsed: chunk.tokensUsed,
              latencyMs: chunk.latencyMs,
            };

            setMessages((prev) => [...prev, assistantMessage]);
            setStreamingText('');
            onMessage?.(assistantMessage);
            onComplete?.({
              response: accumulatedText,
              tokensUsed: chunk.tokensUsed || 0,
              latencyMs: chunk.latencyMs || 0,
              toolsUsed: currentToolUsesRef.current?.map((t) => t.name) || [],
              sources,
            });
            break;

          case 'error':
            const err = new Error(chunk.error || 'Unknown streaming error');
            setError(err);
            onError?.(err);
            break;
        }
      }
    },
    [sessionId, userId, tenantId, generateId, onMessage, onError, onComplete]
  );

  /**
   * メッセージを送信
   */
  const sendMessage = useCallback(
    async (content: string, context?: Record<string, unknown>) => {
      if (isStreaming || !clientRef.current) return;

      // ユーザーメッセージを追加
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      lastUserMessageRef.current = content;

      setIsStreaming(true);
      setError(null);
      setStreamingText('');

      try {
        await sendWithStream(content, context);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        onError?.(error);
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, generateId, sendWithStream, onError]
  );

  /**
   * メッセージをクリア
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingText('');
    setError(null);
  }, []);

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * 最後のアシスタントメッセージを再生成
   */
  const regenerate = useCallback(async () => {
    if (isStreaming || !lastUserMessageRef.current) return;

    // 最後のアシスタントメッセージを削除
    setMessages((prev) => {
      const lastAssistantIndex = [...prev].reverse().findIndex((m) => m.role === 'assistant');
      if (lastAssistantIndex === -1) return prev;
      const removeIndex = prev.length - 1 - lastAssistantIndex;
      return prev.slice(0, removeIndex);
    });

    // 再送信
    await sendMessage(lastUserMessageRef.current);
  }, [isStreaming, sendMessage]);

  return {
    messages,
    isStreaming,
    streamingText,
    error,
    sendMessage,
    clearMessages,
    clearError,
    regenerate,
  };
}
