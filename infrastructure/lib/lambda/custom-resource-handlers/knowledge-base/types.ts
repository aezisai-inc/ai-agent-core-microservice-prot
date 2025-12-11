/**
 * Type definitions for Bedrock Knowledge Base Custom Resource
 */

/**
 * Storage type for Knowledge Base
 */
export type StorageType = 'S3_VECTORS' | 'OPENSEARCH_SERVERLESS';

/**
 * Resource properties passed from CloudFormation
 */
export interface KnowledgeBaseResourceProperties {
  /** Knowledge Base name */
  Name: string;

  /** Environment name */
  Environment: string;

  /** S3 bucket ARN for documents */
  DocumentsBucketArn: string;

  /** S3 prefix for documents */
  DocumentsPrefix: string;

  /** Embedding model ARN */
  EmbeddingModelArn: string;

  /** Storage type */
  StorageType: StorageType;

  /** S3 bucket ARN for vectors (when using S3_VECTORS) */
  VectorBucketArn?: string;

  /** ServiceToken (CDK internal) */
  ServiceToken: string;
}

/**
 * Response data returned to CloudFormation
 */
export interface KnowledgeBaseResponseData {
  /** Knowledge Base ID */
  KnowledgeBaseId: string;

  /** Knowledge Base ARN */
  KnowledgeBaseArn: string;

  /** Data Source ID */
  DataSourceId: string;

  /** IAM Role ARN */
  RoleArn: string;

  /** Current status */
  Status: string;
}

/**
 * Knowledge Base resource from Bedrock API
 */
export interface KnowledgeBaseResource {
  knowledgeBaseId: string;
  knowledgeBaseArn?: string;
  name: string;
  description?: string;
  status: string;
  roleArn: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Data Source resource from Bedrock API
 */
export interface DataSourceResource {
  dataSourceId: string;
  name: string;
  status: string;
  knowledgeBaseId: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
