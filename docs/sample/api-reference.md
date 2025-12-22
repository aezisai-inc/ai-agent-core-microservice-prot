# API リファレンス

## 概要

当社のREST APIを使用して、プログラムからエージェントを操作できます。

## 認証

すべてのAPIリクエストには、Authorization ヘッダーにAPIキーを含める必要があります。

```
Authorization: Bearer YOUR_API_KEY
```

APIキーは管理画面の「設定」→「API」から取得できます。

## エンドポイント

### チャット

#### POST /api/v1/chat

エージェントにメッセージを送信し、回答を取得します。

**リクエスト**
```json
{
  "message": "製品の返品方法を教えてください",
  "session_id": "sess-12345",
  "stream": false
}
```

**パラメータ**
| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| message | string | はい | ユーザーからのメッセージ |
| session_id | string | いいえ | セッション識別子（会話継続用） |
| stream | boolean | いいえ | ストリーミングレスポンスの有効化 |

**レスポンス**
```json
{
  "id": "resp-67890",
  "content": "返品は購入から30日以内であれば可能です...",
  "sources": [
    {
      "title": "返品ポリシー",
      "score": 0.95
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200
  }
}
```

### ナレッジベース

#### POST /api/v1/knowledge/upload

ドキュメントをナレッジベースにアップロードします。

**リクエスト**
```
Content-Type: multipart/form-data
```

**パラメータ**
| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| file | file | はい | アップロードするファイル |
| metadata | object | いいえ | カスタムメタデータ |

**レスポンス**
```json
{
  "document_id": "doc-abc123",
  "status": "processing",
  "estimated_time": 300
}
```

#### GET /api/v1/knowledge/status/{document_id}

ドキュメントの処理状態を確認します。

**レスポンス**
```json
{
  "document_id": "doc-abc123",
  "status": "completed",
  "chunks": 15,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### セッション

#### GET /api/v1/sessions/{session_id}/history

セッションの会話履歴を取得します。

**レスポンス**
```json
{
  "session_id": "sess-12345",
  "messages": [
    {
      "role": "user",
      "content": "こんにちは",
      "timestamp": "2025-01-01T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "こんにちは！ご質問をお聞かせください。",
      "timestamp": "2025-01-01T10:00:01Z"
    }
  ]
}
```

## エラーコード

| コード | 説明 |
|-------|------|
| 400 | 不正なリクエスト |
| 401 | 認証エラー（APIキー不正） |
| 403 | 権限エラー |
| 404 | リソースが見つからない |
| 429 | レート制限超過 |
| 500 | サーバーエラー |

## レート制限

- スターター: 100リクエスト/分
- プロフェッショナル: 1000リクエスト/分
- エンタープライズ: カスタム

制限を超えた場合、429エラーが返されます。`Retry-After` ヘッダーで待機時間を確認してください。

## SDK

以下の言語用SDKを提供しています：

- Python: `pip install agentic-rag-sdk`
- JavaScript: `npm install @agentic-rag/sdk`
- Go: `go get github.com/example/agentic-rag-go`

各SDKのドキュメントは GitHub リポジトリを参照してください。










