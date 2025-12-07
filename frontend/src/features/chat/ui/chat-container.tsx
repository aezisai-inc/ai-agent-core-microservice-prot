"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { MessageList } from "@/shared/ui/organisms/message-list";
import { ChatInput } from "@/shared/ui/molecules/chat-input";
import { useChatStream, ChatMessage } from "../hooks/use-chat-stream";
import { useAuth } from "../hooks/use-auth";
import { getAgentCoreConfig, isConfigValid } from "@/shared/lib/config";

// cn utility function
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface ChatContainerProps {
  agentId: string;
  className?: string;
}

/**
 * セッションID生成
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Chat Container
 * 
 * AgentCore Runtime への直接接続でストリーミングチャットを提供。
 * 認証は Cognito 経由、設定は環境変数経由で取得。
 */
export function ChatContainer({ agentId, className }: ChatContainerProps) {
  const [sessionId] = useState(generateSessionId);
  const [configError, setConfigError] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  
  // 認証状態
  const { user, isAuthenticated, isLoading: authLoading, getIdToken } = useAuth();

  // 設定チェックとIDトークン取得
  useEffect(() => {
    if (!isConfigValid()) {
      setConfigError(
        'アプリケーションの設定が完了していません。管理者にお問い合わせください。'
      );
    }
    
    // IDトークンを取得
    if (isAuthenticated) {
      getIdToken().then(setIdToken);
    }
  }, [isAuthenticated, getIdToken]);

  // AgentCore 設定（環境変数から取得）
  const agentCoreConfig = useMemo(() => {
    const config = getAgentCoreConfig();
    return {
      ...config,
      authToken: idToken || undefined,
    };
  }, [idToken]);

  // チャットストリーミング
  const {
    messages,
    isStreaming,
    streamingText,
    error,
    sendMessage,
    clearMessages,
    regenerate,
  } = useChatStream({
    config: agentCoreConfig,
    streamMode: 'sse',
    sessionId,
    userId: user?.userId || 'anonymous',
    tenantId: user?.tenantId,
    onError: (err) => {
      console.error('[ChatContainer] Stream error:', err);
    },
  });

  // メッセージ送信ハンドラ
  const handleSend = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      
      // 認証されていない場合は警告
      if (!isAuthenticated && isConfigValid()) {
        console.warn('[ChatContainer] User not authenticated');
      }

      await sendMessage(content, {
        agentId,
      });
    },
    [sendMessage, agentId, isAuthenticated]
  );

  // メッセージリスト用にフォーマット
  const formattedMessages = useMemo(() => {
    const formatted = messages.map((msg: ChatMessage) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      sources: msg.sources?.map((s) => ({
        title: s.source.split('/').pop() || 'Document',
        url: s.source,
      })),
    }));

    // ストリーミング中のメッセージを追加
    if (isStreaming && streamingText) {
      formatted.push({
        role: 'assistant' as const,
        content: streamingText,
        timestamp: new Date(),
        sources: undefined,
      });
    }

    return formatted;
  }, [messages, isStreaming, streamingText]);

  // 設定エラーの表示
  if (configError) {
    return (
      <div className={cn("flex flex-col h-full items-center justify-center", className)}>
        <div className="text-center p-8">
          <p className="text-yellow-500 mb-4">⚠️ {configError}</p>
          <p className="text-surface-400 text-sm">
            環境変数が正しく設定されているか確認してください。
          </p>
        </div>
      </div>
    );
  }

  // 認証ローディング
  if (authLoading) {
    return (
      <div className={cn("flex flex-col h-full items-center justify-center", className)}>
        <div className="animate-pulse text-surface-400">認証中...</div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* エラー表示 */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-red-400 text-sm">
            エラーが発生しました: {error.message}
          </p>
        </div>
      )}

      {/* 未認証の警告（開発環境のみ） */}
      {!isAuthenticated && process.env.NODE_ENV === 'development' && (
        <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
          <p className="text-yellow-400 text-sm">
            開発モード: 認証なしで動作しています
          </p>
        </div>
      )}

      {/* メッセージリスト */}
      <MessageList 
        messages={formattedMessages} 
        isLoading={isStreaming} 
        className="flex-1" 
      />

      {/* 入力エリア */}
      <div className="p-4 border-t border-surface-800">
        <ChatInput 
          onSend={handleSend} 
          isLoading={isStreaming}
          placeholder={
            isStreaming 
              ? "応答を生成中..." 
              : "メッセージを入力..."
          }
        />
      </div>
    </div>
  );
}
