/**
 * Amplify Gen2 Backend Definition
 * 
 * Amplify Gen2 のバックエンドリソースを定義。
 * 認証 (Cognito) と必要なリソースを設定。
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
 * カスタムリソースの追加 (CDK)
 * 
 * AgentCore Runtime へのアクセス権限など、
 * Amplify 標準機能外のリソースを追加する場合は
 * ここで CDK を使用して定義。
 */
const { cfnResources } = backend;

// Cognito User Pool への追加設定
const userPool = cfnResources.auth.cfnUserPool;
if (userPool) {
  // Lambda トリガーの設定は auth/resource.ts で定義済み
  
  // カスタムドメイン設定 (本番環境用)
  // userPool.userPoolDomain = {
  //   domain: 'auth.example.com',
  // };
}

// Identity Pool (Cognito Federated Identities) 設定
const identityPool = cfnResources.auth.cfnIdentityPool;
if (identityPool) {
  // 認証済みユーザーのデフォルトロールは Amplify が自動設定
  // 追加のカスタマイズが必要な場合はここで設定
}

/**
 * 出力設定
 * 
 * フロントエンドで使用する設定値を出力
 */
backend.addOutput({
  custom: {
    // AgentCore Runtime エンドポイント
    // デプロイ時に実際のエンドポイントを設定
    agentCoreEndpoint: process.env.AGENTCORE_ENDPOINT || '',
    
    // アプリケーションのリージョン
    region: process.env.AWS_REGION || 'ap-northeast-1',
  },
});
