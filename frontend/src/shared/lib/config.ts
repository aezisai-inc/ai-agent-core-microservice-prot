/**
 * Runtime Configuration
 * 
 * 環境変数から設定を取得。
 * 機密情報は Secrets Manager 経由で AWS Amplify 環境変数として注入される。
 * 
 * ⚠️ 重要: 機密情報をソースコードにハードコードしないこと。
 * すべての機密情報は環境変数経由で注入される。
 * 
 * ⚠️ Next.js 注意: process.env[dynamicKey] は動作しない。
 * 静的な process.env.NEXT_PUBLIC_XXX のみがビルド時にインライン化される。
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
 * 環境変数のバリデーション
 * 
 * ビルド時とランタイム時の両方で動作するよう、
 * 環境変数がない場合はプレースホルダーを返す。
 * 実際の使用時に isConfigValid() でチェックする。
 */
function validateEnvVar(name: string, value: string | undefined): string {
  if (!value) {
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
 * ⚠️ 重要: Next.js では process.env[dynamicKey] は動作しない。
 * 各環境変数は直接 process.env.NEXT_PUBLIC_XXX で参照する必要がある。
 */
export function getConfig(): EnvironmentConfig {
  // Next.js requires static property access for env vars to be inlined at build time
  // process.env[dynamicKey] does NOT work - only process.env.STATIC_KEY works
  return {
    agentRuntimeArn: validateEnvVar(
      'NEXT_PUBLIC_AGENT_RUNTIME_ARN',
      process.env.NEXT_PUBLIC_AGENT_RUNTIME_ARN
    ),
    agentEndpointName: validateEnvVar(
      'NEXT_PUBLIC_AGENT_ENDPOINT_NAME',
      process.env.NEXT_PUBLIC_AGENT_ENDPOINT_NAME
    ),
    // Cognito: 両方のパターンをサポート（静的アクセスで OR 演算）
    cognitoUserPoolId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_USER_POOL_ID',
      process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_USER_POOL_ID
    ),
    cognitoClientId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_CLIENT_ID',
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID
    ),
    cognitoIdentityPoolId: validateEnvVar(
      'NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID',
      process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID || process.env.NEXT_PUBLIC_IDENTITY_POOL_ID
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
