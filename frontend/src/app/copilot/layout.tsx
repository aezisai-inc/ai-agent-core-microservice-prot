/**
 * CopilotKit Layout
 *
 * CopilotKit Provider を /copilot 配下のみに適用。
 * 既存の Provider（Amplify, React Query）とは独立。
 *
 * Note: このレイアウトは /copilot ルート専用。
 * 既存の / ルートには影響しない。
 *
 * 重要: Next.js の Static Export (output: export) モードでは
 * API Routes が使用できないため、CopilotKit は外部エンドポイント
 * （環境変数 NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL）に直接接続する。
 */
"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { useAuth } from "@/features/chat/hooks/use-auth";
import { getCopilotKitRuntimeUrl, isCopilotKitConfigValid } from "@/shared/lib/config";
import { useEffect, useState, type ReactNode } from "react";

export default function CopilotLayout({ children }: { children: ReactNode }) {
  const { getIdToken, isAuthenticated, isLoading } = useAuth();
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});
  const runtimeUrl = getCopilotKitRuntimeUrl();

  // Cognito JWT を取得して CopilotKit に渡す
  useEffect(() => {
    if (isAuthenticated) {
      getIdToken().then((token) => {
        if (token) {
          setAuthHeaders({
            Authorization: `Bearer ${token}`,
          });
        }
      });
    }
  }, [isAuthenticated, getIdToken]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-surface-400">認証確認中...</div>
      </div>
    );
  }

  // CopilotKit Runtime URL が未設定の場合
  if (!isCopilotKitConfigValid() || !runtimeUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="max-w-md text-center p-6 bg-surface-900 rounded-lg border border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100 mb-3">
            CopilotKit 未設定
          </h2>
          <p className="text-surface-400 text-sm mb-4">
            CopilotKit を使用するには、環境変数{" "}
            <code className="px-1 py-0.5 bg-surface-800 rounded text-amber-400">
              NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL
            </code>{" "}
            を設定してください。
          </p>
          <p className="text-surface-500 text-xs">
            AG-UI Protocol エンドポイント URL（例: https://your-agentcore-endpoint/ag-ui）
          </p>
          <div className="mt-4 pt-4 border-t border-surface-700">
            <a
              href="/"
              className="text-accent-400 hover:text-accent-300 text-sm"
            >
              ← 既存のチャット UI に戻る
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CopilotKit runtimeUrl={runtimeUrl} headers={authHeaders}>
      {children}
    </CopilotKit>
  );
}
