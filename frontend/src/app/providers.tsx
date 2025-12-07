"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { Amplify } from "aws-amplify";
import { getCognitoConfig, isConfigValid } from "@/shared/lib/config";

/**
 * Amplify 初期化
 * 
 * 環境変数から Cognito 設定を取得して初期化。
 * 機密情報は Secrets Manager → 環境変数経由で注入される。
 */
function initializeAmplify() {
  // 設定が有効な場合のみ初期化
  if (!isConfigValid()) {
    console.warn('[Amplify] Configuration not valid. Skipping initialization.');
    return;
  }

  const cognitoConfig = getCognitoConfig();

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cognitoConfig.userPoolId,
        userPoolClientId: cognitoConfig.userPoolClientId,
        identityPoolId: cognitoConfig.identityPoolId,
        loginWith: {
          email: true,
        },
        signUpVerificationMethod: 'code',
        userAttributes: {
          email: {
            required: true,
          },
        },
        passwordFormat: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialCharacters: true,
        },
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [isAmplifyInitialized, setIsAmplifyInitialized] = useState(false);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Amplify 初期化（クライアントサイドのみ）
  useEffect(() => {
    if (typeof window !== 'undefined' && !isAmplifyInitialized) {
      initializeAmplify();
      setIsAmplifyInitialized(true);
    }
  }, [isAmplifyInitialized]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
