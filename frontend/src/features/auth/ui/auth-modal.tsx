"use client";

import { useState } from "react";
import { X, Mail, Lock, LogIn, UserPlus, Loader2 } from "lucide-react";
import { useAuth } from "@/features/chat/hooks/use-auth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = "signin" | "signup";

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { login, register, confirmRegistration, isLoading, error } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    try {
      if (needsConfirmation) {
        await confirmRegistration(email, confirmCode);
        setNeedsConfirmation(false);
        // 確認後に自動でサインイン
        await login(email, password);
        onClose();
      } else if (mode === "signin") {
        await login(email, password);
        onClose();
      } else {
        await register(email, password);
        setNeedsConfirmation(true);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "エラーが発生しました");
    }
  };

  const displayError = localError || (error?.message);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative glass rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl border border-primary-500/20">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-surface-400 hover:text-surface-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-surface-100">
            {needsConfirmation 
              ? "確認コードを入力" 
              : mode === "signin" 
                ? "サインイン" 
                : "アカウント作成"}
          </h2>
          <p className="text-surface-400 mt-2">
            {needsConfirmation
              ? "メールに送信された確認コードを入力してください"
              : mode === "signin"
                ? "AgentCore にアクセスするにはサインインが必要です"
                : "新しいアカウントを作成します"}
          </p>
        </div>

        {/* Error message */}
        {displayError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{displayError}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {needsConfirmation ? (
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">
                確認コード
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  className="w-full px-4 py-3 pl-12 bg-surface-900/50 border border-surface-700 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-primary-500 transition-colors"
                  placeholder="123456"
                  required
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-500" />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  メールアドレス
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 pl-12 bg-surface-900/50 border border-surface-700 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-primary-500 transition-colors"
                    placeholder="you@example.com"
                    required
                  />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  パスワード
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pl-12 bg-surface-900/50 border border-surface-700 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-primary-500 transition-colors"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-surface-500" />
                </div>
                {mode === "signup" && (
                  <p className="mt-2 text-xs text-surface-500">
                    8文字以上、大小英字・数字・記号を含む
                  </p>
                )}
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gradient-to-r from-primary-600 to-accent-600 text-white font-medium rounded-lg hover:from-primary-500 hover:to-accent-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                処理中...
              </>
            ) : needsConfirmation ? (
              <>
                <LogIn className="h-5 w-5" />
                確認して続ける
              </>
            ) : mode === "signin" ? (
              <>
                <LogIn className="h-5 w-5" />
                サインイン
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                アカウント作成
              </>
            )}
          </button>
        </form>

        {/* Toggle mode */}
        {!needsConfirmation && (
          <div className="mt-6 text-center">
            <p className="text-surface-400 text-sm">
              {mode === "signin" ? (
                <>
                  アカウントをお持ちでない場合は{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="text-primary-400 hover:text-primary-300 font-medium"
                  >
                    新規登録
                  </button>
                </>
              ) : (
                <>
                  既にアカウントをお持ちの場合は{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="text-primary-400 hover:text-primary-300 font-medium"
                  >
                    サインイン
                  </button>
                </>
              )}
            </p>
          </div>
        )}

        {/* Test credentials hint */}
        <div className="mt-6 p-4 bg-surface-800/50 rounded-lg border border-surface-700">
          <p className="text-xs text-surface-500 text-center">
            テスト用: test@example.com / TestPass123!
          </p>
        </div>
      </div>
    </div>
  );
}

