/**
 * Chat Stream Hook
 * 
 * AgentCore Runtime へのストリーミングチャットを管理する React Hook。
 * SSE/WebSocket 両方のストリーミングモードをサポート。
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AgentCoreClient,
  StreamChunk,
  InvokeParams,
  InvokeResponse,
  AgentCoreConfig,
} from '../api/agentcore-client';

export type StreamMode = 'sse' | 'websocket' | 'none';

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
  sources?: Array<{
    content: string;
    score: number;
    source: string;
  }>;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface UseChatStreamOptions {
  /** AgentCore クライアント設定 */
  config: AgentCoreConfig;
  /** ストリーミングモード */
  streamMode?: StreamMode;
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
  /** ストリーミングをキャンセル */
  cancelStream: () => void;
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
    streamMode = 'sse',
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
  const wsCleanupRef = useRef<(() => void) | null>(null);
  const lastUserMessageRef = useRef<string>('');
  const currentToolUsesRef = useRef<ChatMessage['toolUses']>([]);

  // クライアント初期化
  useEffect(() => {
    clientRef.current = new AgentCoreClient(config);
    return () => {
      clientRef.current?.cancelStream();
      wsCleanupRef.current?.();
    };
  }, [config]);

  // 認証トークン更新
  useEffect(() => {
    if (config.authToken && clientRef.current) {
      clientRef.current.setAuthToken(config.authToken);
    }
  }, [config.authToken]);

  /**
   * ユニークID生成
   */
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * SSE ストリーミングでメッセージを送信
   */
  const sendWithSSE = useCallback(
    async (prompt: string, context?: Record<string, unknown>) => {
      if (!clientRef.current) return;

      const params: InvokeParams = {
        sessionId,
        userId,
        tenantId,
        prompt,
        context,
        stream: true,
      };

      let accumulatedText = '';
      currentToolUsesRef.current = [];

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

          case 'end':
            const assistantMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: accumulatedText,
              timestamp: new Date(),
              toolUses: currentToolUsesRef.current,
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
              sources: [],
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
   * WebSocket ストリーミングでメッセージを送信
   */
  const sendWithWebSocket = useCallback(
    (prompt: string, context?: Record<string, unknown>) => {
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

      wsCleanupRef.current = clientRef.current.connectWebSocket(params, {
        onChunk: (chunk: StreamChunk) => {
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

            case 'end':
              const assistantMessage: ChatMessage = {
                id: generateId(),
                role: 'assistant',
                content: accumulatedText,
                timestamp: new Date(),
                toolUses: currentToolUsesRef.current,
                tokensUsed: chunk.tokensUsed,
                latencyMs: chunk.latencyMs,
              };

              setMessages((prev) => [...prev, assistantMessage]);
              setStreamingText('');
              setIsStreaming(false);
              onMessage?.(assistantMessage);
              break;

            case 'error':
              const err = new Error(chunk.error || 'Unknown WebSocket error');
              setError(err);
              setIsStreaming(false);
              onError?.(err);
              break;
          }
        },
        onError: (err) => {
          setError(err);
          setIsStreaming(false);
          onError?.(err);
        },
        onClose: () => {
          setIsStreaming(false);
        },
      });
    },
    [sessionId, userId, tenantId, generateId, onMessage, onError]
  );

  /**
   * 非ストリーミングでメッセージを送信
   */
  const sendWithoutStream = useCallback(
    async (prompt: string, context?: Record<string, unknown>) => {
      if (!clientRef.current) return;

      const params: InvokeParams = {
        sessionId,
        userId,
        tenantId,
        prompt,
        context,
        stream: false,
      };

      const response = await clientRef.current.invoke(params);

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        sources: response.sources,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      onMessage?.(assistantMessage);
      onComplete?.(response);
    },
    [sessionId, userId, tenantId, generateId, onMessage, onComplete]
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
        switch (streamMode) {
          case 'sse':
            await sendWithSSE(content, context);
            break;
          case 'websocket':
            sendWithWebSocket(content, context);
            return; // WebSocket は非同期で完了を待たない
          case 'none':
            await sendWithoutStream(content, context);
            break;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        onError?.(error);
      } finally {
        if (streamMode !== 'websocket') {
          setIsStreaming(false);
        }
      }
    },
    [
      isStreaming,
      streamMode,
      generateId,
      sendWithSSE,
      sendWithWebSocket,
      sendWithoutStream,
      onError,
    ]
  );

  /**
   * ストリーミングをキャンセル
   */
  const cancelStream = useCallback(() => {
    clientRef.current?.cancelStream();
    wsCleanupRef.current?.();
    wsCleanupRef.current = null;
    setIsStreaming(false);
    setStreamingText('');
  }, []);

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
    cancelStream,
    clearMessages,
    clearError,
    regenerate,
  };
}
