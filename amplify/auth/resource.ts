/**
 * Amplify Gen2 Auth Resource
 * 
 * Cognito User Pool の設定を定義。
 * AgentCore Runtime への認証用 JWT トークンを提供。
 * 
 * 注意: Amplify Gen2 の標準的な Auth 設定を使用。
 * Lambda トリガーは必要に応じて追加可能（現在は無効化）。
 */

import { defineAuth } from '@aws-amplify/backend';

/**
 * 認証設定
 * 
 * Amplify Gen2 Auth の基本設定。
 * シンプルな Email 認証を使用。
 */
export const auth = defineAuth({
  // ログイン方法: Email のみ
  loginWith: {
    email: true,
  },
  
  // ユーザー属性（標準設定）
  // カスタム属性は Amplify Gen2 では別途設定が必要
  
  // 注意: 以下の設定は Amplify Gen2 では異なる方法で設定
  // - パスワードポリシー: Cognito のデフォルト設定を使用
  // - MFA: デフォルトはオプショナル
  // - Lambda トリガー: defineFunction で別途定義が必要
  
  // グループ定義（Amplify Gen2 では groups を直接サポート）
  // 必要に応じて後から追加
  // groups: ['admin', 'user', 'viewer'],
});

/**
 * 将来的な拡張:
 * 
 * 1. Lambda トリガーの追加:
 *    - amplify/functions/auth/pre-signup/handler.ts を作成
 *    - defineFunction で定義し、auth.triggers.preSignUp に設定
 * 
 * 2. カスタム属性の追加:
 *    - CDK の cfnUserPool.schema で設定
 * 
 * 3. OAuth プロバイダーの追加:
 *    - loginWith.externalProviders で設定
 */
