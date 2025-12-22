/**
 * CopilotKit Chat Page
 *
 * CopilotKit の標準 UI コンポーネントを使用したチャット画面。
 * 既存の / ルートとは完全に独立。
 *
 * Features:
 * - CopilotChat による標準的な AI チャット UI
 * - 既存の useAuth() による認証連携
 * - 既存の AuthModal による認証 UI
 */
"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useAuth } from "@/features/chat/hooks/use-auth";
import { AuthModal } from "@/features/auth";
import { useState } from "react";
import Link from "next/link";
import "@copilotkit/react-ui/styles.css";

export default function CopilotPage() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-surface-400">読み込み中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-surface-950">
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-surface-100">
            CopilotKit Chat
          </h1>
          <p className="mb-6 text-surface-400">
            サインインしてチャットを開始してください
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="rounded-lg bg-primary-600 px-6 py-3 font-medium text-white hover:bg-primary-500"
          >
            サインイン
          </button>
          <div className="mt-4">
            <Link href="/" className="text-sm text-surface-500 hover:text-surface-300">
              ← 既存UIに戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {/* Header */}
      <header className="border-b border-surface-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-surface-100">
              CopilotKit Chat
            </h1>
            <span className="rounded bg-primary-600/20 px-2 py-0.5 text-xs text-primary-400">
              AG-UI Protocol
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-surface-400">
              {user?.email || user?.username}
            </span>
            <button
              onClick={() => logout()}
              className="text-sm text-surface-500 hover:text-surface-300"
            >
              サインアウト
            </button>
            <Link
              href="/"
              className="text-sm text-surface-500 hover:text-surface-300"
            >
              既存UIへ
            </Link>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden">
        <CopilotChat
          labels={{
            title: "AI アシスタント",
            initial: "何かお手伝いできることはありますか？",
            placeholder: "メッセージを入力...",
          }}
          className="h-full"
        />
      </main>
    </div>
  );
}
