/**
 * Knowledge Base Stack
 *
 * Bedrock Knowledge Base のプロビジョニング
 * Custom Resource Construct を使用して Knowledge Base を IaC 管理
 *
 * @see docs/architecture/iac-custom-resource-design.md
 */

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { BedrockKnowledgeBase, StorageType } from './constructs';

export interface KnowledgeBaseStackProps extends cdk.StackProps {
  /**
   * 環境名 (development/staging/production)
   */
  environment: string;

  /**
   * Knowledge Base 名
   *
   * @default agentcore-kb-{environment}
   */
  knowledgeBaseName?: string;

  /**
   * ドキュメント用S3バケット
   * 指定しない場合は新規作成
   */
  documentsBucket?: s3.IBucket;

  /**
   * ドキュメントプレフィックス
   *
   * @default 'documents/'
   */
  documentsPrefix?: string;

  /**
   * ストレージタイプ
   *
   * @default 'S3_VECTORS'
   */
  storageType?: StorageType;

  /**
   * ベクトル用S3バケット (S3_VECTORS使用時)
   * 指定しない場合は新規作成
   */
  vectorBucket?: s3.IBucket;

  /**
   * Embedding モデル ID
   *
   * @default 'amazon.titan-embed-text-v2:0'
   */
  embeddingModelId?: string;
}

/**
 * Bedrock Knowledge Base Stack
 */
export class KnowledgeBaseStack extends cdk.Stack {
  /**
   * Knowledge Base ID
   */
  public readonly knowledgeBaseId: string;

  /**
   * Knowledge Base ARN
   */
  public readonly knowledgeBaseArn: string;

  /**
   * Data Source ID
   */
  public readonly dataSourceId: string;

  /**
   * Documents S3 Bucket
   */
  public readonly documentsBucket: s3.IBucket;

  /**
   * Vector S3 Bucket (if using S3_VECTORS)
   */
  public readonly vectorBucket?: s3.IBucket;

  /**
   * Knowledge Base Construct
   */
  public readonly knowledgeBase: BedrockKnowledgeBase;

  constructor(scope: Construct, id: string, props: KnowledgeBaseStackProps) {
    super(scope, id, props);

    const {
      environment,
      knowledgeBaseName = `agentcore-kb-${environment}`,
      documentsPrefix = 'documents/',
      storageType = 'S3_VECTORS',
      embeddingModelId = 'amazon.titan-embed-text-v2:0',
    } = props;

    const accountId = this.account;

    // Documents Bucket
    this.documentsBucket =
      props.documentsBucket ??
      new s3.Bucket(this, 'DocumentsBucket', {
        bucketName: `agentcore-documents-${accountId}-${environment}`,
        removalPolicy:
          environment === 'production'
            ? cdk.RemovalPolicy.RETAIN
            : cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: environment !== 'production',
        versioned: true,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      });

    // Vector Bucket (for S3_VECTORS storage type)
    if (storageType === 'S3_VECTORS') {
      this.vectorBucket =
        props.vectorBucket ??
        new s3.Bucket(this, 'VectorBucket', {
          bucketName: `agentcore-vectors-${accountId}-${environment}`,
          removalPolicy:
            environment === 'production'
              ? cdk.RemovalPolicy.RETAIN
              : cdk.RemovalPolicy.DESTROY,
          autoDeleteObjects: environment !== 'production',
          versioned: false,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });
    }

    // Create Knowledge Base using Custom Resource Construct
    this.knowledgeBase = new BedrockKnowledgeBase(this, 'KnowledgeBase', {
      name: knowledgeBaseName,
      environment,
      documentsBucketArn: this.documentsBucket.bucketArn,
      documentsPrefix,
      embeddingModelId,
      storageType,
      vectorBucketArn: this.vectorBucket?.bucketArn,
      saveToSsm: true,
      ssmPrefix: `/agentcore/${environment}`,
    });

    // Expose values
    this.knowledgeBaseId = this.knowledgeBase.knowledgeBaseId;
    this.knowledgeBaseArn = this.knowledgeBase.knowledgeBaseArn;
    this.dataSourceId = this.knowledgeBase.dataSourceId;

    // Stack-level outputs
    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'Documents S3 Bucket Name',
    });

    if (this.vectorBucket) {
      new cdk.CfnOutput(this, 'VectorBucketName', {
        value: this.vectorBucket.bucketName,
        description: 'Vector S3 Bucket Name',
      });
    }

    // Tags
    cdk.Tags.of(this).add('Component', 'BedrockKnowledgeBase');
    cdk.Tags.of(this).add('ManagedBy', 'CDK-CustomResource');
  }
}
