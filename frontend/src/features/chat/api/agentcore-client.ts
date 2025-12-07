/**
 * AgentCore Runtime Client
 * 
 * AWS SDK を使用して AgentCore Runtime を直接呼び出す。
 * Cognito Identity Pool から取得した認証情報を使用。
 */

import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { fetchAuthSession } from "aws-amplify/auth";

export interface AgentCoreConfig {
  /** AWS リージョン */
  region: string;
  /** AgentCore Runtime ID (例: agentcoreRuntimeDevelopment-XXX) */
  agentRuntimeId: string;
  /** AgentCore Endpoint ID */
  agentEndpointId: string;
  /** Cognito Identity Pool ID */
  identityPoolId: string;
  /** Cognito User Pool ID */
  userPoolId: string;
}

export interface InvokeParams {
  /** セッション ID */
  sessionId: string;
  /** ユーザー ID */
  userId: string;
  /** テナント ID (マルチテナント対応) */
  tenantId?: string;
  /** プロンプト/質問 */
  prompt: string;
  /** コンテキスト情報 */
  context?: Record<string, unknown>;
}

export interface RAGSource {
  /** コンテンツ */
  content: string;
  /** 関連度スコア (0-1) */
  score: number;
  /** ソースファイル名/パス */
  source: string;
}

export interface StreamChunk {
  /** チャンクタイプ */
  type: 'text' | 'tool_use' | 'tool_result' | 'sources' | 'end' | 'error';
  /** テキストコンテンツ (type='text' の場合) */
  content?: string;
  /** ツール名 (type='tool_use' の場合) */
  toolName?: string;
  /** ツール入力 (type='tool_use' の場合) */
  toolInput?: Record<string, unknown>;
  /** ツール結果 (type='tool_result' の場合) */
  toolResult?: string;
  /** RAGソース (type='sources' の場合) */
  sources?: RAGSource[];
  /** エラーメッセージ (type='error' の場合) */
  error?: string;
  /** 使用トークン数 (type='end' の場合) */
  tokensUsed?: number;
  /** レイテンシ (type='end' の場合) */
  latencyMs?: number;
}

export interface InvokeResponse {
  /** 応答テキスト */
  response: string;
  /** 使用トークン数 */
  tokensUsed: number;
  /** レイテンシ (ms) */
  latencyMs: number;
  /** 使用されたツール */
  toolsUsed: string[];
  /** 参照ソース */
  sources: RAGSource[];
}

/**
 * AgentCore Runtime クライアント
 * AWS SDK を使用して直接 AgentCore を呼び出す
 */
export class AgentCoreClient {
  private config: AgentCoreConfig;
  private client: BedrockAgentCoreClient | null = null;

  constructor(config: AgentCoreConfig) {
    this.config = config;
  }

  /**
   * Bedrock AgentCore クライアントを初期化
   * Cognito 認証情報を使用
   */
  private async getClient(): Promise<BedrockAgentCoreClient> {
    if (this.client) {
      return this.client;
    }

    try {
      // Amplify から認証セッションを取得
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (idToken) {
        // 認証済みユーザー用の認証情報
        const credentials = fromCognitoIdentityPool({
          clientConfig: { region: this.config.region },
          identityPoolId: this.config.identityPoolId,
          logins: {
            [`cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`]: idToken,
          },
        });

        this.client = new BedrockAgentCoreClient({
          region: this.config.region,
          credentials,
        });
      } else {
        // 未認証ユーザー用の認証情報
        const credentials = fromCognitoIdentityPool({
          clientConfig: { region: this.config.region },
          identityPoolId: this.config.identityPoolId,
        });

        this.client = new BedrockAgentCoreClient({
          region: this.config.region,
          credentials,
        });
      }

      return this.client;
    } catch (error) {
      console.error("Failed to initialize AgentCore client:", error);
      
      // フォールバック: 未認証クライアント
      const credentials = fromCognitoIdentityPool({
        clientConfig: { region: this.config.region },
        identityPoolId: this.config.identityPoolId,
      });

      this.client = new BedrockAgentCoreClient({
        region: this.config.region,
        credentials,
      });

      return this.client;
    }
  }

  /**
   * AgentCore を invoke してストリーミングレスポンスを取得
   */
  async *stream(params: InvokeParams): AsyncGenerator<StreamChunk, void, unknown> {
    const startTime = Date.now();
    let fullResponse = "";
    const sources: RAGSource[] = [];

    try {
      const client = await this.getClient();

      const command = new InvokeAgentRuntimeCommand({
        runtimeIdentifier: this.config.agentRuntimeId,
        runtimeEndpointName: this.config.agentEndpointId,
        payload: {
          prompt: params.prompt,
          sessionId: params.sessionId,
          userId: params.userId,
          tenantId: params.tenantId,
          context: params.context,
        },
      });

      const response = await client.send(command);

      // ストリーミングレスポンスを処理
      if (response.responseStream) {
        for await (const event of response.responseStream) {
          // テキストチャンク
          if (event.chunk?.bytes) {
            const text = new TextDecoder().decode(event.chunk.bytes);
            fullResponse += text;
            yield {
              type: "text",
              content: text,
            };
          }

          // JSON形式のイベント
          if (event.chunk?.bytes) {
            try {
              const text = new TextDecoder().decode(event.chunk.bytes);
              const data = JSON.parse(text);
              
              if (data.type === 'text' && data.content) {
                fullResponse += data.content;
                yield { type: 'text', content: data.content };
              } else if (data.type === 'sources' && data.sources) {
                sources.push(...data.sources);
                yield { type: 'sources', sources: data.sources };
              } else if (data.type === 'tool_use') {
                yield { 
                  type: 'tool_use', 
                  toolName: data.name, 
                  toolInput: data.input 
                };
              } else if (data.type === 'tool_result') {
                yield { type: 'tool_result', toolResult: data.result };
              }
            } catch {
              // JSONじゃない場合はテキストとして扱う（既に処理済み）
            }
          }
        }
      }

      // 非ストリーミングレスポンス
      if (response.output) {
        const outputText = typeof response.output === 'string' 
          ? response.output 
          : JSON.stringify(response.output);
        fullResponse = outputText;
        yield { type: "text", content: outputText };
      }

      // ソースがあれば送信
      if (sources.length > 0) {
        yield {
          type: "sources",
          sources,
        };
      }

      // 完了
      yield {
        type: "end",
        latencyMs: Date.now() - startTime,
        tokensUsed: 0,
      };

    } catch (error) {
      console.error("AgentCore invocation failed:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * 同期的な invoke (非ストリーミング)
   */
  async invoke(params: InvokeParams): Promise<InvokeResponse> {
    const startTime = Date.now();
    let fullResponse = "";
    const sources: RAGSource[] = [];

    for await (const chunk of this.stream(params)) {
      if (chunk.type === "text" && chunk.content) {
        fullResponse += chunk.content;
      }
      if (chunk.type === "sources" && chunk.sources) {
        sources.push(...chunk.sources);
      }
    }

    return {
      response: fullResponse,
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
      toolsUsed: [],
      sources,
    };
  }

  /**
   * クライアントをリセット（再認証時に使用）
   */
  reset(): void {
    this.client = null;
  }
}

/**
 * AgentCore エラー
 */
export class AgentCoreError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "AgentCoreError";
  }
}

/**
 * デフォルトクライアントのシングルトン
 */
let defaultClient: AgentCoreClient | null = null;

export function getAgentCoreClient(config?: AgentCoreConfig): AgentCoreClient {
  if (!defaultClient && config) {
    defaultClient = new AgentCoreClient(config);
  }
  if (!defaultClient) {
    throw new Error("AgentCoreClient not initialized. Call with config first.");
  }
  return defaultClient;
}

export function initAgentCoreClient(config: AgentCoreConfig): AgentCoreClient {
  defaultClient = new AgentCoreClient(config);
  return defaultClient;
}
