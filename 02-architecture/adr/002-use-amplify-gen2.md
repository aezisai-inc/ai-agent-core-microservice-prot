# ADR-002: AWS Amplify Gen2 の採用（フロントエンド）

## ステータス

Accepted (2024-12)

## コンテキスト

フロントエンド（Next.js 15）のホスティングとCI/CD環境を選定する必要がある。
バックエンドはAgentCore Runtime（ECR）で運用するため、フロントエンドのみのホスティングソリューションが求められる。

### 要件

1. Next.js 15 (App Router) のStatic Exportに対応
2. CodePipeline連携による自動デプロイ
3. プレビュー環境（ブランチごと）
4. Cognito認証との統合
5. **ストリーミング通信（SSE/WebSocket）のサポート**
6. カスタムドメイン + SSL

## 決定

**AWS Amplify Gen2** をフロントエンドホスティングとして採用する。

## 理由

### Amplify Gen2 を選択した理由

1. **TypeScript-first の設定**
   - `amplify/` ディレクトリでインフラをコードで定義
   - 型安全な設定ファイル
   - CDKとの親和性

2. **Next.js 15 サポート**
   - App Router対応
   - Static Export最適化
   - 自動ビルド設定検出

3. **Cognito統合の簡素化**
   - `amplify/auth/resource.ts` で宣言的に定義
   - フロントエンドSDK自動生成
   - AgentCore Identityとの連携

4. **ストリーミング対応アーキテクチャ**
   - SSE (Server-Sent Events) 対応
   - WebSocket (双方向ストリーミング) 対応
   - **AgentCore Runtime への直接接続**（Gateway不要）

5. **開発体験**
   - ブランチごとの自動プレビュー環境
   - Pull Requestプレビュー
   - 環境変数の環境別管理

### 代替案

| 代替案 | 評価 | 却下理由 |
|-------|------|---------|
| S3 + CloudFront (CDK) | ○ | CI/CDの自前構築が必要、認証統合が煩雑 |
| Vercel | ○ | AWS外部サービス、Cognito統合が複雑 |
| Amplify Gen1 | △ | 設定がJSON/YAML、型安全性が低い |
| CloudFront Functions | △ | SSR非対応、Static Exportのみ |

### なぜ Amplify Gen2 か（Gen1との比較）

```
┌─────────────────────────────────────────────────────────────────┐
│                  Amplify Gen1 vs Gen2                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Gen1:                          Gen2:                           │
│  ├── amplify/                   ├── amplify/                    │
│  │   ├── backend/               │   ├── auth/                   │
│  │   │   └── backend-config.json│   │   └── resource.ts  ← TS! │
│  │   └── #current-cloud-backend │   ├── data/                   │
│  └── amplify.yml                │   │   └── resource.ts         │
│                                 │   ├── functions/              │
│  特徴:                          │   │   └── resource.ts         │
│  - JSON/YAML設定               │   └── backend.ts               │
│  - CLIベースの操作              │                                │
│  - GraphQL (AppSync) 中心       │  特徴:                         │
│                                 │  - TypeScript設定              │
│                                 │  - CDK互換                     │
│                                 │  - 柔軟なバックエンド連携      │
│                                 │                                │
└─────────────────────────────────────────────────────────────────┘
```

## アーキテクチャ

### フロントエンド構成（AgentCore Runtime 直接接続）

```
┌─────────────────────────────────────────────────────────────────┐
│                    Amplify Gen2 Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   GitHub Repository                                             │
│   └── frontend/                                                 │
│       ├── amplify/                                              │
│       │   ├── auth/                                             │
│       │   │   └── resource.ts      # Cognito設定                │
│       │   └── backend.ts           # バックエンド統合            │
│       ├── src/                                                  │
│       │   ├── app/                 # Next.js App Router         │
│       │   └── features/                                         │
│       │       └── chat/                                         │
│       │           ├── api/                                      │
│       │           │   └── agentcore-client.ts # Runtime直接呼出│
│       │           └── hooks/                                    │
│       │               └── use-chat-stream.ts  # SSE実装         │
│       └── amplify.yml              # ビルド設定                  │
│                                                                 │
│   ↓ Git Push → CodePipeline                                     │
│                                                                 │
│   Amplify Hosting                                               │
│   ├── Build: npm run build (Static Export)                     │
│   ├── Deploy: CloudFront + S3                                  │
│   └── Auth: Cognito User Pool                                  │
│                                                                 │
│   ↓ HTTPS (SSE/WebSocket)                                       │
│                                                                 │
│   AgentCore Runtime (直接接続)                                   │
│   └── InvokeAgentRuntime API → SSE Streaming Response          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### ストリーミング通信の実装

```typescript
// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';

export const backend = defineBackend({
  auth,
});

// AgentCore Runtime への直接接続
// Gateway は不要 - Runtime が直接 SSE/WebSocket をサポート
```

```typescript
// src/features/chat/api/agentcore-client.ts
import { fetchAuthSession } from 'aws-amplify/auth';

// AgentCore Runtime エンドポイント（Gateway ではなく Runtime 直接）
const AGENTCORE_RUNTIME_ENDPOINT = process.env.NEXT_PUBLIC_AGENTCORE_RUNTIME_ENDPOINT;

export async function invokeAgentStream(prompt: string, sessionId: string) {
  const { tokens } = await fetchAuthSession();
  const accessToken = tokens?.accessToken?.toString();

  // AgentCore Runtime InvokeAgentRuntime API を直接呼び出し
  const response = await fetch(`${AGENTCORE_RUNTIME_ENDPOINT}/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Session-Id': sessionId,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`AgentCore Runtime error: ${response.status}`);
  }

  return response.body; // ReadableStream for SSE
}

// WebSocket 接続（双方向ストリーミング用）
export function createAgentWebSocket(sessionId: string): WebSocket {
  const { tokens } = await fetchAuthSession();
  const accessToken = tokens?.accessToken?.toString();
  
  const ws = new WebSocket(
    `${AGENTCORE_RUNTIME_ENDPOINT.replace('https', 'wss')}/ws?token=${accessToken}&session=${sessionId}`
  );
  
  return ws;
}
```

```typescript
// src/features/chat/hooks/use-chat-stream.ts
import { useState, useCallback } from 'react';
import { invokeAgentStream } from '../api/agentcore-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function useChatStream(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (prompt: string) => {
    // ユーザーメッセージを追加
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
    };
    setMessages(prev => [...prev, userMessage]);

    // アシスタントメッセージのプレースホルダー
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }]);

    setIsStreaming(true);

    try {
      // AgentCore Runtime を直接呼び出し
      const stream = await invokeAgentStream(prompt, sessionId);
      const reader = stream?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No stream reader');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              setMessages(prev => prev.map(msg =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + parsed.content }
                  : msg
              ));
            } catch {
              // Non-JSON data, append as-is
              setMessages(prev => prev.map(msg =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + data }
                  : msg
              ));
            }
          }
        }
      }

      // ストリーミング完了
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId
          ? { ...msg, isStreaming: false }
          : msg
      ));
    } catch (error) {
      console.error('Streaming error:', error);
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId
          ? { ...msg, content: 'エラーが発生しました', isStreaming: false }
          : msg
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [sessionId]);

  return { messages, sendMessage, isStreaming };
}
```

### Cognito認証設定

```typescript
// amplify/auth/resource.ts
import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    preferredUsername: {
      required: false,
      mutable: true,
    },
  },
  // マルチテナント対応
  groups: ['admin', 'user'],
  
  // AgentCore Identityとの連携用
  // Access Tokenのカスタムクレームにtenant_idを追加
  triggers: {
    preTokenGeneration: {
      // カスタムLambdaでtenant_id追加
    },
  },
});
```

## ブランチ戦略

```
┌─────────────────────────────────────────────────────────────────┐
│                    Branch Strategy                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   main ─────────────────────────────────────────► Production    │
│     │                                             (amplify.app) │
│     │                                                           │
│   staging ──────────────────────────────────────► Staging       │
│     │                                             (staging.xxx) │
│     │                                                           │
│   feature/* ────────────────────────────────────► Preview       │
│                                                   (pr-123.xxx)  │
│                                                                 │
│   環境変数:                                                      │
│   - main:    NEXT_PUBLIC_AGENTCORE_RUNTIME_ENDPOINT=prod.xxx    │
│   - staging: NEXT_PUBLIC_AGENTCORE_RUNTIME_ENDPOINT=staging.xxx │
│   - preview: NEXT_PUBLIC_AGENTCORE_RUNTIME_ENDPOINT=dev.xxx     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 影響

### ポジティブ

- **開発効率向上**
  - Git Pushで自動デプロイ（CodePipeline連携）
  - ブランチごとのプレビュー環境
  - TypeScript設定による型安全性

- **Cognito統合の簡素化**
  - 宣言的な認証設定
  - フロントエンドSDK自動生成
  - AgentCore Identityとの連携

- **ストリーミング対応**
  - SSE/WebSocket 経由でリアルタイムレスポンス
  - AgentCore Runtime 直接接続（低レイテンシ）

- **運用負荷削減**
  - マネージドCI/CD
  - 自動SSL証明書管理
  - CloudFront CDN組み込み

### ネガティブ

- Amplify特有の学習コスト
- Gen2は比較的新しく、ドキュメントが限定的
- SSR機能を使う場合は追加設定が必要

### リスク軽減策

1. **Static Export優先**
   - SSRは使用せず、Static Exportで運用
   - 必要に応じてISR検討

2. **段階的移行**
   - 既存のVercel/S3構成がある場合は並行運用
   - 検証完了後に切り替え

## プロジェクト構成

```
frontend/
├── amplify/
│   ├── auth/
│   │   └── resource.ts          # Cognito設定
│   └── backend.ts               # バックエンド統合
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── chat/
│   │       └── page.tsx
│   ├── features/
│   │   └── chat/
│   │       ├── api/
│   │       │   └── agentcore-client.ts  # Runtime直接呼び出し
│   │       ├── hooks/
│   │       │   └── use-chat-stream.ts
│   │       └── components/
│   │           ├── ChatContainer.tsx
│   │           └── MessageBubble.tsx
│   └── shared/
│       ├── lib/
│       │   └── amplify-config.ts
│       └── ui/
│           └── atoms/
├── amplify.yml                  # Amplifyビルド設定
├── next.config.ts
├── package.json
└── tsconfig.json
```

### amplify.yml

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: out
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

## 参照

- [AWS Amplify Gen2 Documentation](https://docs.amplify.aws/gen2/)
- [Amplify + Next.js](https://docs.amplify.aws/gen2/start/quickstart/nextjs-app-router-client-components/)
- [Amplify Auth](https://docs.amplify.aws/gen2/build-a-backend/auth/)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [AgentCore Runtime Streaming](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/response-streaming.html)
