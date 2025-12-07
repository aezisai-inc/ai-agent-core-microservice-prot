"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Amplify } from "aws-amplify";
import { getCognitoConfig, isConfigValid } from "@/shared/lib/config";

/**
 * Amplify 初期化 (モジュールロード時に即座に実行)
 * 
 * 環境変数から Cognito 設定を取得して初期化。
 * useEffect で初期化すると子コンポーネントの初期化と競合するため、
 * モジュールレベルで同期的に初期化する。
 */
let amplifyInitialized = false;

function initializeAmplify() {
  if (amplifyInitialized) return;
  if (typeof window === 'undefined') return; // SSR ではスキップ
  
  // 設定が有効な場合のみ初期化
  if (!isConfigValid()) {
    console.warn('[Amplify] Configuration not valid. Skipping initialization.');
    return;
  }

  const cognitoConfig = getCognitoConfig();

  try {
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
    amplifyInitialized = true;
    console.log('[Amplify] Configured successfully');
  } catch (error) {
    console.error('[Amplify] Configuration failed:', error);
  }
}

// クライアントサイドで即座に初期化
if (typeof window !== 'undefined') {
  initializeAmplify();
}

export function Providers({ children }: { children: ReactNode }) {
  // Providers がマウントされる時点で再度初期化を試行
  // (遅延ロードなどで初回呼び出しが遅れた場合に備えて)
  if (typeof window !== 'undefined' && !amplifyInitialized) {
    initializeAmplify();
  }

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

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
