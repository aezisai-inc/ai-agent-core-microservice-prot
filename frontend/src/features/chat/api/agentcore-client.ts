/**
 * AgentCore Runtime Client
 * 
 * AgentCore Runtime への直接接続を提供するクライアント。
 * SSE/WebSocket によるストリーミングをサポート。
 */

export interface AgentCoreConfig {
  /** AgentCore Runtime エンドポイント URL */
  endpoint: string;
  /** 認証トークン (Cognito JWT) */
  authToken?: string;
  /** リクエストタイムアウト (ms) */
  timeout?: number;
  /** リトライ回数 */
  maxRetries?: number;
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
  /** ストリーミングを有効にするか */
  stream?: boolean;
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
  sources: Array<{
    content: string;
    score: number;
    source: string;
  }>;
}

/**
 * AgentCore Runtime クライアント
 */
export class AgentCoreClient {
  private config: Required<AgentCoreConfig>;
  private abortController: AbortController | null = null;

  constructor(config: AgentCoreConfig) {
    this.config = {
      endpoint: config.endpoint,
      authToken: config.authToken || '',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
    };
  }

  /**
   * 認証トークンを更新
   */
  setAuthToken(token: string): void {
    this.config.authToken = token;
  }

  /**
   * 同期的な invoke (非ストリーミング)
   */
  async invoke(params: InvokeParams): Promise<InvokeResponse> {
    const response = await this.fetchWithRetry(
      `${this.config.endpoint}/invoke`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session_id: params.sessionId,
          user_id: params.userId,
          tenant_id: params.tenantId,
          prompt: params.prompt,
          context: params.context,
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      throw new AgentCoreError(
        `Invoke failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const data = await response.json();
    return {
      response: data.response || '',
      tokensUsed: data.tokens_used || 0,
      latencyMs: data.latency_ms || 0,
      toolsUsed: data.tools_used || [],
      sources: data.sources || [],
    };
  }

  /**
   * SSE ストリーミング invoke
   */
  async *stream(params: InvokeParams): AsyncGenerator<StreamChunk, void, unknown> {
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.config.endpoint}/invoke`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          session_id: params.sessionId,
          user_id: params.userId,
          tenant_id: params.tenantId,
          prompt: params.prompt,
          context: params.context,
          stream: true,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new AgentCoreError(
          `Stream failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new AgentCoreError('No response body', 500);
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield {
                type: 'end',
                latencyMs: Date.now() - startTime,
              };
              return;
            }

            try {
              const chunk = JSON.parse(data);
              yield this.parseChunk(chunk);
            } catch {
              // JSON parse error, skip
              console.warn('Failed to parse SSE chunk:', data);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        yield { type: 'end', latencyMs: Date.now() - startTime };
        return;
      }
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * WebSocket ストリーミング
   */
  connectWebSocket(
    params: InvokeParams,
    callbacks: {
      onChunk: (chunk: StreamChunk) => void;
      onError: (error: Error) => void;
      onClose: () => void;
    }
  ): () => void {
    const wsEndpoint = this.config.endpoint.replace(/^http/, 'ws') + '/ws';
    const ws = new WebSocket(wsEndpoint);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'invoke',
        session_id: params.sessionId,
        user_id: params.userId,
        tenant_id: params.tenantId,
        prompt: params.prompt,
        context: params.context,
        auth_token: this.config.authToken,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callbacks.onChunk(this.parseChunk(data));
      } catch (error) {
        console.warn('Failed to parse WebSocket message:', event.data);
      }
    };

    ws.onerror = (event) => {
      callbacks.onError(new Error('WebSocket error'));
    };

    ws.onclose = () => {
      callbacks.onClose();
    };

    // クリーンアップ関数を返す
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }

  /**
   * ストリーミングをキャンセル
   */
  cancelStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    return headers;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 0
  ): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.timeout
      );

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (retries < this.config.maxRetries) {
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, retries) * 1000)
        );
        return this.fetchWithRetry(url, options, retries + 1);
      }
      throw error;
    }
  }

  private parseChunk(data: Record<string, unknown>): StreamChunk {
    const type = data.type as string;

    switch (type) {
      case 'text':
      case 'content_block_delta':
        return {
          type: 'text',
          content: (data.delta as { text?: string })?.text || data.content as string || '',
        };

      case 'tool_use':
        return {
          type: 'tool_use',
          toolName: data.name as string || data.tool_name as string,
          toolInput: data.input as Record<string, unknown> || data.tool_input as Record<string, unknown>,
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          toolResult: data.result as string || data.tool_result as string,
        };

      case 'sources':
      case 'rag_sources':
        return {
          type: 'sources',
          sources: (data.sources as RAGSource[]) || [],
        };

      case 'message_stop':
      case 'end':
        return {
          type: 'end',
          tokensUsed: (data.usage as { output_tokens?: number })?.output_tokens || data.tokens_used as number,
          sources: (data.sources as RAGSource[]) || undefined,
        };

      case 'error':
        return {
          type: 'error',
          error: data.message as string || data.error as string || 'Unknown error',
        };

      default:
        // テキストとして扱う
        if (data.content || data.text) {
          return {
            type: 'text',
            content: data.content as string || data.text as string,
          };
        }
        return { type: 'text', content: '' };
    }
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
    this.name = 'AgentCoreError';
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
    throw new Error('AgentCoreClient not initialized. Call with config first.');
  }
  return defaultClient;
}

export function initAgentCoreClient(config: AgentCoreConfig): AgentCoreClient {
  defaultClient = new AgentCoreClient(config);
  return defaultClient;
}
