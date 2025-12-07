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
  /** AgentCore Runtime エンドポイント URL */
  agentCoreEndpoint: string;
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
 */
function validateEnvVar(name: string, value: string | undefined): string {
  if (!value) {
    // 開発環境ではデフォルト値を使用（本番では必須）
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Config] Missing environment variable: ${name}. Using placeholder for development.`);
      return `PLACEHOLDER_${name}`;
    }
    throw new Error(`Missing required environment variable: ${name}`);
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
    agentCoreEndpoint: validateEnvVar(
      'NEXT_PUBLIC_AGENTCORE_ENDPOINT',
      process.env.NEXT_PUBLIC_AGENTCORE_ENDPOINT
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
    endpoint: config.agentCoreEndpoint,
    timeout: 30000,
    maxRetries: 3,
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
      !config.agentCoreEndpoint.startsWith('PLACEHOLDER_') &&
      !config.cognitoUserPoolId.startsWith('PLACEHOLDER_') &&
      !config.cognitoClientId.startsWith('PLACEHOLDER_')
    );
  } catch {
    return false;
  }
}
