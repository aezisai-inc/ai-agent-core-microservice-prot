/**
 * Runtime Configuration
 * 
 * 環境変数から設定を取得。
 * 機密情報は Secrets Manager 経由で AWS Amplify 環境変数として注入される。
 * 
 * ⚠️ 重要: 機密情報をソースコードにハードコードしないこと。
 * すべての機密情報は環境変数経由で注入される。
 */

/**
 * 環境変数の型定義
 */
interface EnvironmentConfig {
  /** AgentCore Runtime ID */
  agentRuntimeId: string;
  /** AgentCore Endpoint ID */
  agentEndpointId: string;
  /** Cognito User Pool ID */
  cognitoUserPoolId: string;
  /** Cognito Client ID */
  cognitoClientId: string;
  /** Cognito Identity Pool ID */
  cognitoIdentityPoolId: string;
  /** AWS リージョン */
  awsRegion: string;
  /** 環境名 (development, staging, production) */
  environment: string;
}

/**
 * 環境変数のバリデーション
 * 
 * ビルド時とランタイム時の両方で動作するよう、
 * 環境変数がない場合はプレースホルダーを返す。
 * 実際の使用時に isConfigValid() でチェックする。
 */
function validateEnvVar(name: string, value: string | undefined): string {
  if (!value) {
    // ビルド時やローカル開発時はプレースホルダーを使用
    // ランタイムで isConfigValid() をチェックして適切にハンドリング
    if (typeof window === 'undefined') {
      // SSR/ビルド時は警告のみ
      console.warn(`[Config] Missing environment variable: ${name}. Using placeholder.`);
    }
    return `PLACEHOLDER_${name}`;
  }
  return value;
}

/**
 * 設定を取得
 * 
 * 環境変数は以下の方法で注入される:
 * 1. AWS Amplify: Secrets Manager → 環境変数として自動注入
 * 2. ローカル開発: .env.local ファイル（.gitignoreに含まれる）
 */
export function getConfig(): EnvironmentConfig {
  return {
    agentRuntimeId: validateEnvVar(
      'NEXT_PUBLIC_AGENT_RUNTIME_ID',
      process.env.NEXT_PUBLIC_AGENT_RUNTIME_ID
    ),
    agentEndpointId: validateEnvVar(
      'NEXT_PUBLIC_AGENT_ENDPOINT_ID',
      process.env.NEXT_PUBLIC_AGENT_ENDPOINT_ID
    ),
    cognitoUserPoolId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_USER_POOL_ID',
      process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
    ),
    cognitoClientId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_CLIENT_ID',
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
    ),
    cognitoIdentityPoolId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID',
      process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID
    ),
    awsRegion: process.env.NEXT_PUBLIC_AWS_REGION || 'ap-northeast-1',
    environment: process.env.NODE_ENV || 'development',
  };
}

/**
 * AgentCore 設定を取得
 */
export function getAgentCoreConfig() {
  const config = getConfig();
  return {
    region: config.awsRegion,
    agentRuntimeId: config.agentRuntimeId,
    agentEndpointId: config.agentEndpointId,
    identityPoolId: config.cognitoIdentityPoolId,
    userPoolId: config.cognitoUserPoolId,
  };
}

/**
 * Cognito 設定を取得
 */
export function getCognitoConfig() {
  const config = getConfig();
  return {
    userPoolId: config.cognitoUserPoolId,
    userPoolClientId: config.cognitoClientId,
    identityPoolId: config.cognitoIdentityPoolId,
    region: config.awsRegion,
  };
}

/**
 * 設定が有効かどうかをチェック
 */
export function isConfigValid(): boolean {
  try {
    const config = getConfig();
    return (
      !config.agentRuntimeId.startsWith('PLACEHOLDER_') &&
      !config.agentEndpointId.startsWith('PLACEHOLDER_') &&
      !config.cognitoUserPoolId.startsWith('PLACEHOLDER_') &&
      !config.cognitoClientId.startsWith('PLACEHOLDER_')
    );
  } catch {
    return false;
  }
}
