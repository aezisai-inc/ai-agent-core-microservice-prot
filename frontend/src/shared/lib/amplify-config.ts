/**
 * Amplify Configuration
 * 
 * Amplify Gen2 のクライアント設定を提供。
 * 注意: このファイルは config.ts と統一された環境変数を使用。
 */

import { Amplify } from 'aws-amplify';
import { getCognitoConfig, isAuthConfigValid } from './config';

/**
 * Amplify 設定
 * 
 * 本番環境では amplify_outputs.json から自動読み込み。
 * 開発環境では環境変数またはデフォルト値を使用。
 * 
 * 注意: config.ts と同じ環境変数を使用するため、
 * NEXT_PUBLIC_COGNITO_USER_POOL_ID または NEXT_PUBLIC_USER_POOL_ID のいずれかが設定されていれば動作。
 */
export function configureAmplify() {
  // config.ts から統一された設定を取得
  const cognitoConfig = getCognitoConfig();
  
  const config = {
    Auth: {
      Cognito: {
        userPoolId: cognitoConfig.userPoolId,
        userPoolClientId: cognitoConfig.userPoolClientId,
        identityPoolId: cognitoConfig.identityPoolId,
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
      region: cognitoConfig.region,
    },
  };

  // 認証設定が有効でない場合は警告
  if (!isAuthConfigValid()) {
    console.warn('[Amplify] Auth configuration is not valid. Check environment variables.');
  }

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
