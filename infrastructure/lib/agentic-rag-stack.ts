/**
 * Agentic RAG Stack
 * 
 * AgentCore + Amplify Gen2 構成のメインスタック
 * 各サブスタックを組み合わせて完全な環境を構築
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AgenticRagStackProps extends cdk.StackProps {
  /** 環境名 (dev/staging/prod) */
  environment?: string;
}

export class AgenticRagStack extends cdk.Stack {
  /** イベントストア (DynamoDB) */
  public readonly eventsTable: dynamodb.Table;
  /** リードモデル (DynamoDB) */
  public readonly readModelsTable: dynamodb.Table;
  /** ドキュメントバケット (S3) */
  public readonly documentsBucket: s3.Bucket;
  /** ベクトルインデックスバケット (S3) */
  public readonly vectorBucket: s3.Bucket;
  /** 暗号化キー (KMS) */
  public readonly encryptionKey: kms.Key;
  /** Cognito User Pool */
  public readonly userPool: cognito.UserPool;
  /** Cognito User Pool Client */
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: AgenticRagStackProps) {
    super(scope, id, props);

    const environment = props?.environment || 'development';

    // KMS 暗号化キー
    this.encryptionKey = new kms.Key(this, 'EncryptionKey', {
      alias: `agentcore-${environment}-key`,
      description: 'Encryption key for Agentic RAG data',
      enableKeyRotation: true,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // イベントストア (DynamoDB) - Event Sourcing用
    this.eventsTable = new dynamodb.Table(this, 'EventsTable', {
      tableName: `agentic-rag-events-${environment}`,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI: aggregate_type でのクエリ用
    this.eventsTable.addGlobalSecondaryIndex({
      indexName: 'gsi-aggregate-type',
      partitionKey: {
        name: 'aggregate_type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // リードモデル (DynamoDB) - CQRS クエリ用
    this.readModelsTable = new dynamodb.Table(this, 'ReadModelsTable', {
      tableName: `agentic-rag-read-models-${environment}`,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: entity_type でのクエリ用
    this.readModelsTable.addGlobalSecondaryIndex({
      indexName: 'gsi-entity-type',
      partitionKey: {
        name: 'entity_type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'updated_at',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // ドキュメントバケット (S3)
    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `agentcore-documents-${this.account}-${environment}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
          enabled: true,
        },
      ],
    });

    // ベクトルインデックスバケット (S3 Vector / Knowledge Base)
    this.vectorBucket = new s3.Bucket(this, 'VectorBucket', {
      bucketName: `agentcore-vectors-${this.account}-${environment}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
    });

    // ============================================
    // Cognito User Pool (認証)
    // ============================================

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `agentic-rag-users-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        tenant_id: new cognito.StringAttribute({ mutable: true }),
        role: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // User Pool Client
    this.userPoolClient = this.userPool.addClient('UserPoolClient', {
      userPoolClientName: `agentic-rag-client-${environment}`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
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
      generateSecret: false, // SPAの場合はfalse
    });

    // CloudFormation 出力
    new cdk.CfnOutput(this, 'EventsTableName', {
      value: this.eventsTable.tableName,
      description: 'Events Table Name (Event Sourcing)',
      exportName: `${environment}-EventsTableName`,
    });

    new cdk.CfnOutput(this, 'EventsTableArn', {
      value: this.eventsTable.tableArn,
      description: 'Events Table ARN',
      exportName: `${environment}-EventsTableArn`,
    });

    new cdk.CfnOutput(this, 'ReadModelsTableName', {
      value: this.readModelsTable.tableName,
      description: 'Read Models Table Name (CQRS)',
      exportName: `${environment}-ReadModelsTableName`,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'Documents S3 Bucket',
      exportName: `${environment}-DocumentsBucketName`,
    });

    new cdk.CfnOutput(this, 'VectorBucketName', {
      value: this.vectorBucket.bucketName,
      description: 'Vector Index S3 Bucket (Knowledge Base)',
      exportName: `${environment}-VectorBucketName`,
    });

    new cdk.CfnOutput(this, 'EncryptionKeyArn', {
      value: this.encryptionKey.keyArn,
      description: 'KMS Encryption Key ARN',
      exportName: `${environment}-EncryptionKeyArn`,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${environment}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${environment}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `${environment}-UserPoolArn`,
    });
  }
}
