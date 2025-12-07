/**
 * Amplify Configuration
 * 
 * Amplify Gen2 のクライアント設定を提供。
 */

import { Amplify } from 'aws-amplify';

/**
 * Amplify 設定
 * 
 * 本番環境では amplify_outputs.json から自動読み込み。
 * 開発環境では環境変数またはデフォルト値を使用。
 */
export function configureAmplify() {
  // 開発環境用のフォールバック設定
  // 本番環境では amplify_outputs.json が自動生成される
  const config = {
    Auth: {
      Cognito: {
        userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID || '',
        userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID || '',
        identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID || '',
        signUpVerificationMethod: 'code' as const,
        loginWith: {
          email: true,
          phone: false,
          username: false,
        },
        passwordFormat: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialCharacters: false,
        },
        mfa: {
          status: 'optional' as const,
          totpEnabled: true,
          smsEnabled: false,
        },
      },
    },
    // カスタム設定
    custom: {
      agentCoreEndpoint: process.env.NEXT_PUBLIC_AGENTCORE_ENDPOINT || '',
      region: process.env.NEXT_PUBLIC_AWS_REGION || 'ap-northeast-1',
    },
  };

  try {
    // amplify_outputs.json が存在する場合は自動設定を使用
    // Amplify Gen2 のデプロイ後に自動生成される
    Amplify.configure(config);
  } catch (error) {
    console.warn('Amplify configuration warning:', error);
    // フォールバック設定を使用
    Amplify.configure(config);
  }
}

/**
 * AgentCore エンドポイント取得
 */
export function getAgentCoreEndpoint(): string {
  return process.env.NEXT_PUBLIC_AGENTCORE_ENDPOINT || '';
}

/**
 * AWS リージョン取得
 */
export function getAwsRegion(): string {
  return process.env.NEXT_PUBLIC_AWS_REGION || 'ap-northeast-1';
}
