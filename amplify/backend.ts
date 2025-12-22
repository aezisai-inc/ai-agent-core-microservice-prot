/**
 * Amplify Gen2 Backend Definition
 * 
 * Amplify Gen2 のバックエンドリソースを定義。
 * 認証 (Cognito) と必要なリソースを設定。
 * 
 * 注意: このファイルは Amplify Gen2 のバックエンド定義に使用。
 * Amplify Hosting で静的サイトをデプロイする場合は別途設定が必要。
 */

import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';

/**
 * Amplify バックエンド定義
 */
export const backend = defineBackend({
  auth,
});

/**
 * カスタム出力設定
 * 
 * フロントエンドで使用する設定値を出力。
 * 注意: Amplify Gen2 では amplify_outputs.json に自動出力される。
 */
backend.addOutput({
  custom: {
    // AgentCore Runtime エンドポイント
    // 実際のエンドポイントは環境変数で設定
    agentCoreEndpoint: process.env.AGENTCORE_ENDPOINT || '',
    
    // アプリケーションのリージョン
    region: process.env.AWS_REGION || 'ap-northeast-1',
  },
});

/**
 * 将来的な拡張:
 * 
 * 1. CDK によるカスタムリソース追加:
 *    const { cfnResources } = backend;
 *    
 * 2. Cognito User Pool のカスタマイズ:
 *    - カスタム属性
 *    - Lambda トリガー
 *    - パスワードポリシー
 *    
 * 3. Identity Pool のカスタマイズ:
 *    - IAM ロール
 *    - 外部プロバイダー
 */
