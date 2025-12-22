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
  /** CopilotKit Runtime URL（AG-UI Protocol エンドポイント） */
  copilotKitRuntimeUrl: string;
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
    copilotKitRuntimeUrl: validateEnvVar(
      'NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL',
      process.env.NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL
    ),
  };
}

/**
 * AgentCore ARN をパースして Runtime ARN と Endpoint Name を分離
 * 
 * 入力形式のパターン:
 * 1. フル ARN: arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID/runtime-endpoint/ENDPOINT_NAME
 * 2. Runtime ARN のみ: arn:aws:bedrock-agentcore:REGION:ACCOUNT:runtime/RUNTIME_ID
 * 
 * @param arn - AgentCore ARN（フル形式または Runtime のみ）
 * @param endpointName - 環境変数で別途指定された Endpoint Name（オプション）
 * @returns { runtimeArn, endpointName }
 */
function parseAgentCoreArn(arn: string, endpointName?: string): { runtimeArn: string; endpointName: string } {
  // フル ARN パターン: runtime-endpoint を含む場合
  const fullArnPattern = /^(arn:aws:bedrock-agentcore:[^:]+:[^:]+:runtime\/[^/]+)\/runtime-endpoint\/(.+)$/;
  const match = arn.match(fullArnPattern);
  
  if (match) {
    // フル ARN から Runtime ARN と Endpoint Name を抽出
    return {
      runtimeArn: match[1],
      endpointName: endpointName || match[2], // 環境変数で指定があればそちらを優先
    };
  }
  
  // Runtime ARN のみの場合
  return {
    runtimeArn: arn,
    endpointName: endpointName || '',
  };
}

/**
 * AgentCore 設定を取得
 */
export function getAgentCoreConfig() {
  const config = getConfig();
  
  // ARN をパースして Runtime ARN と Endpoint Name を分離
  const { runtimeArn, endpointName } = parseAgentCoreArn(
    config.agentRuntimeArn,
    config.agentEndpointName
  );
  
  return {
    region: config.awsRegion,
    agentRuntimeArn: runtimeArn,
    agentEndpointName: endpointName,
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
    const config = getAgentCoreConfig();
    return (
      !config.agentRuntimeArn.startsWith('PLACEHOLDER_') &&
      config.agentRuntimeArn.includes('bedrock-agentcore') &&
      config.agentEndpointName.length > 0
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

/**
 * CopilotKit Runtime URL を取得
 * 
 * @returns CopilotKit Runtime URL または undefined（未設定時）
 */
export function getCopilotKitRuntimeUrl(): string | undefined {
  const config = getConfig();
  if (config.copilotKitRuntimeUrl.startsWith('PLACEHOLDER_')) {
    return undefined;
  }
  return config.copilotKitRuntimeUrl;
}

/**
 * CopilotKit 設定が有効かどうかをチェック
 */
export function isCopilotKitConfigValid(): boolean {
  return getCopilotKitRuntimeUrl() !== undefined;
}
