/**
 * Amplify Gen2 Auth Resource
 * 
 * Cognito User Pool の設定を定義。
 * AgentCore Runtime への認証用 JWT トークンを提供。
 */

import { defineAuth, secret } from '@aws-amplify/backend';

/**
 * 認証設定
 */
export const auth = defineAuth({
  // ログイン方法
  loginWith: {
    email: {
      // メール検証設定
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'Agentic RAG - 確認コード',
      verificationEmailBody: (createCode) => 
        `確認コード: ${createCode()}`,
    },
  },

  // パスワードポリシー
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSpecialCharacters: false,
  },

  // ユーザー属性
  userAttributes: {
    // カスタム属性
    'custom:tenant_id': {
      dataType: 'String',
      mutable: true,
    },
    'custom:role': {
      dataType: 'String',
      mutable: true,
    },
  },

  // MFA 設定
  multifactor: {
    mode: 'OPTIONAL',
    totp: true,
    sms: false,
  },

  // アカウント復旧
  accountRecovery: 'EMAIL_ONLY',

  // OAuth 設定 (オプション)
  // 外部 IdP を使用する場合に設定
  /*
  externalProviders: {
    google: {
      clientId: secret('GOOGLE_CLIENT_ID'),
      clientSecret: secret('GOOGLE_CLIENT_SECRET'),
    },
    oidc: [
      {
        name: 'EnterpriseSSO',
        clientId: secret('SSO_CLIENT_ID'),
        clientSecret: secret('SSO_CLIENT_SECRET'),
        issuerUrl: 'https://sso.example.com',
        attributeMapping: {
          email: 'email',
          custom: {
            tenant_id: 'tenant',
          },
        },
      },
    ],
    callbackUrls: [
      'http://localhost:3000/auth/callback',
      'https://app.example.com/auth/callback',
    ],
    logoutUrls: [
      'http://localhost:3000/',
      'https://app.example.com/',
    ],
  },
  */

  // トリガー (Lambda)
  triggers: {
    // サインアップ前処理
    preSignUp: 'functions/auth/pre-signup',
    // サインアップ後処理
    postConfirmation: 'functions/auth/post-confirmation',
    // トークン生成前処理 (カスタムクレーム追加)
    preTokenGeneration: 'functions/auth/pre-token-generation',
  },

  // グループ定義
  groups: ['admin', 'user', 'viewer'],

  // アクセス制御
  access: (allow) => [
    // 管理者グループは全てのユーザー情報にアクセス可能
    allow.resource('admin').to(['read', 'update', 'delete']),
    // ユーザーは自身の情報のみアクセス可能
    allow.resource('user').to(['read']),
  ],
});
