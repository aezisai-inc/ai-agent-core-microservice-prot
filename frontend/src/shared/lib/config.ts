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
  /** AgentCore Runtime ARN */
  agentRuntimeArn: string;
  /** AgentCore Endpoint Name */
  agentEndpointName: string;
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
 * 環境変数名のマッピング
 * config.ts と amplify-config.ts で統一された変数名を使用
 */
const ENV_VAR_NAMES = {
  // Cognito 関連 (2つのパターンをサポート)
  USER_POOL_ID: ['NEXT_PUBLIC_COGNITO_USER_POOL_ID', 'NEXT_PUBLIC_USER_POOL_ID'],
  CLIENT_ID: ['NEXT_PUBLIC_COGNITO_CLIENT_ID', 'NEXT_PUBLIC_USER_POOL_CLIENT_ID'],
  IDENTITY_POOL_ID: ['NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID', 'NEXT_PUBLIC_IDENTITY_POOL_ID'],
  // AgentCore 関連
  AGENT_RUNTIME_ARN: ['NEXT_PUBLIC_AGENT_RUNTIME_ARN'],
  AGENT_ENDPOINT_NAME: ['NEXT_PUBLIC_AGENT_ENDPOINT_NAME'],
} as const;

/**
 * 複数の環境変数名から値を取得
 * 優先順位順に設定された変数名をチェック
 */
function getEnvValue(varNames: readonly string[]): string | undefined {
  for (const name of varNames) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return undefined;
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
 * 
 * 注意: 複数の環境変数名パターンをサポート（config.ts / amplify-config.ts の統一）
 */
export function getConfig(): EnvironmentConfig {
  return {
    agentRuntimeArn: validateEnvVar(
      'NEXT_PUBLIC_AGENT_RUNTIME_ARN',
      getEnvValue(ENV_VAR_NAMES.AGENT_RUNTIME_ARN)
    ),
    agentEndpointName: validateEnvVar(
      'NEXT_PUBLIC_AGENT_ENDPOINT_NAME',
      getEnvValue(ENV_VAR_NAMES.AGENT_ENDPOINT_NAME)
    ),
    cognitoUserPoolId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_USER_POOL_ID',
      getEnvValue(ENV_VAR_NAMES.USER_POOL_ID)
    ),
    cognitoClientId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_CLIENT_ID',
      getEnvValue(ENV_VAR_NAMES.CLIENT_ID)
    ),
    cognitoIdentityPoolId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID',
      getEnvValue(ENV_VAR_NAMES.IDENTITY_POOL_ID)
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
    agentRuntimeArn: config.agentRuntimeArn,
    agentEndpointName: config.agentEndpointName,
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
 * 認証設定（Cognito）が有効かどうかをチェック
 * AgentCore 設定がなくても認証は動作可能
 */
export function isAuthConfigValid(): boolean {
  try {
    const config = getConfig();
    return (
      !config.cognitoUserPoolId.startsWith('PLACEHOLDER_') &&
      !config.cognitoClientId.startsWith('PLACEHOLDER_')
    );
  } catch {
    return false;
  }
}

/**
 * AgentCore 設定が有効かどうかをチェック
 */
export function isAgentCoreConfigValid(): boolean {
  try {
    const config = getConfig();
    return (
      !config.agentRuntimeArn.startsWith('PLACEHOLDER_') &&
      !config.agentEndpointName.startsWith('PLACEHOLDER_')
    );
  } catch {
    return false;
  }
}

/**
 * 設定が有効かどうかをチェック（後方互換性のため残す）
 * 注意: 認証のみを使う場合は isAuthConfigValid() を使用すること
 */
export function isConfigValid(): boolean {
  // 認証設定のみをチェック（AgentCoreは必須ではない）
  return isAuthConfigValid();
}
