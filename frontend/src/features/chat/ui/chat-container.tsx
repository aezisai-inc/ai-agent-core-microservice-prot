"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { LogIn, User } from "lucide-react";
import { MessageList } from "@/shared/ui/organisms/message-list";
import { ChatInput } from "@/shared/ui/molecules/chat-input";
import { useChatStream, ChatMessage } from "../hooks/use-chat-stream";
import { useAuth } from "../hooks/use-auth";
import { getAgentCoreConfig, isAuthConfigValid, isAgentCoreConfigValid } from "@/shared/lib/config";
import { AuthModal } from "@/features/auth";

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
 * AgentCore Runtime は runtimeSessionId が33文字以上必要
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2, 15);
  const random2 = Math.random().toString(36).substring(2, 15);
  // 確実に33文字以上になるようにする
  return `session-${timestamp}-${random1}-${random2}`;
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
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // 認証状態
  const { user, isAuthenticated, isLoading: authLoading, getIdToken, logout } = useAuth();

  // 設定チェックとIDトークン取得
  useEffect(() => {
    // 認証設定が無効な場合のエラー
    if (!isAuthConfigValid()) {
      setConfigError(
        '認証の設定が完了していません。Cognito の環境変数を確認してください。'
      );
      return;
    }
    
    // AgentCore 設定が無効な場合の警告（認証は可能）
    if (!isAgentCoreConfigValid()) {
      console.warn('[ChatContainer] AgentCore configuration not valid. Chat may not work.');
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
      
      // 認証されていない場合はモーダルを表示
      if (!isAuthenticated) {
        setShowAuthModal(true);
        return;
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
      // RAGソース情報をそのまま渡す
      sources: msg.sources,
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
      {/* 認証モーダル */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />

      {/* 認証ステータスバー */}
      <div className="px-4 py-2 border-b border-surface-800 flex items-center justify-between">
        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-green-500/20 text-green-400">
              <User className="h-4 w-4" />
            </div>
            <span className="text-sm text-surface-300">{user?.email || user?.username}</span>
            <button
              onClick={() => logout()}
              className="ml-2 text-xs text-surface-500 hover:text-surface-300 transition-colors"
            >
              サインアウト
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600/20 text-primary-400 rounded-lg hover:bg-primary-600/30 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            サインイン
          </button>
        )}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-red-400 text-sm">
            エラーが発生しました: {error.message}
          </p>
        </div>
      )}

      {/* 未認証時のプロンプト */}
      {!isAuthenticated && messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <LogIn className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-surface-100 mb-2">
              サインインが必要です
            </h3>
            <p className="text-surface-400 mb-6">
              AgentCore にアクセスするには、サインインしてください。
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-primary-600 to-accent-600 text-white font-medium rounded-lg hover:from-primary-500 hover:to-accent-500 transition-all"
            >
              サインイン
            </button>
          </div>
        </div>
      )}

      {/* メッセージリスト (認証時のみ表示) */}
      {(isAuthenticated || messages.length > 0) && (
        <MessageList 
          messages={formattedMessages} 
          isLoading={isStreaming} 
          className="flex-1" 
        />
      )}

      {/* 入力エリア */}
      <div className="p-4 border-t border-surface-800">
        <ChatInput 
          onSend={handleSend} 
          isLoading={isStreaming}
          placeholder={
            !isAuthenticated
              ? "サインインしてメッセージを送信..."
              : isStreaming 
                ? "応答を生成中..." 
                : "メッセージを入力..."
          }
        />
      </div>
    </div>
  );
}
