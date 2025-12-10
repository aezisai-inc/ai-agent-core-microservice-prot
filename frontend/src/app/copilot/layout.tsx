/**
 * CopilotKit Layout
 *
 * CopilotKit Provider を /copilot 配下のみに適用。
 * 既存の Provider（Amplify, React Query）とは独立。
 *
 * Note: このレイアウトは /copilot ルート専用。
 * 既存の / ルートには影響しない。
 */
"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { useAuth } from "@/features/chat/hooks/use-auth";
import { useEffect, useState, type ReactNode } from "react";

export default function CopilotLayout({ children }: { children: ReactNode }) {
  const { getIdToken, isAuthenticated, isLoading } = useAuth();
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});

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

  return (
    <CopilotKit runtimeUrl="/api/copilot" headers={authHeaders}>
      {children}
    </CopilotKit>
  );
}
