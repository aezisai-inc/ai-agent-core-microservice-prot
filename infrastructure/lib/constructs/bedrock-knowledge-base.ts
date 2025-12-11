/**
 * Bedrock Knowledge Base Construct
 *
 * Creates and manages Bedrock Knowledge Base with Data Source using
 * CloudFormation Custom Resource.
 *
 * @example
 * ```typescript
 * const kb = new BedrockKnowledgeBase(this, 'KnowledgeBase', {
 *   name: 'agentcore-kb-dev',
 *   environment: 'development',
 *   documentsBucketArn: bucket.bucketArn,
 *   storageType: 'S3_VECTORS',
 *   vectorBucketArn: vectorBucket.bucketArn,
 * });
 *
 * // Use in other constructs
 * console.log(kb.knowledgeBaseId);
 * ```
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Storage type for Knowledge Base
 */
export type StorageType = 'S3_VECTORS' | 'OPENSEARCH_SERVERLESS';

/**
 * Properties for BedrockKnowledgeBase construct
 */
export interface BedrockKnowledgeBaseProps {
  /**
   * Knowledge Base name
   */
  readonly name: string;

  /**
   * Environment name
   */
  readonly environment: string;

  /**
   * S3 bucket ARN for documents
   */
  readonly documentsBucketArn: string;

  /**
   * S3 prefix for documents
   *
   * @default 'documents/'
   */
  readonly documentsPrefix?: string;

  /**
   * Embedding model ARN or ID
   *
   * @default 'amazon.titan-embed-text-v2:0'
   */
  readonly embeddingModelId?: string;

  /**
   * Storage type for vectors
   */
  readonly storageType: StorageType;

  /**
   * S3 bucket ARN for vectors (required for S3_VECTORS)
   */
  readonly vectorBucketArn?: string;

  /**
   * Whether to save IDs to SSM Parameter Store
   *
   * @default true
   */
  readonly saveToSsm?: boolean;

  /**
   * SSM parameter name prefix
   *
   * @default /agentcore/{environment}
   */
  readonly ssmPrefix?: string;
}

/**
 * Bedrock Knowledge Base Construct
 */
export class BedrockKnowledgeBase extends Construct {
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
   * IAM Role ARN
   */
  public readonly roleArn: string;

  /**
   * Custom Resource handler Lambda function
   */
  public readonly handlerFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: BedrockKnowledgeBaseProps) {
    super(scope, id);

    const {
      name,
      environment,
      documentsBucketArn,
      documentsPrefix = 'documents/',
      embeddingModelId = 'amazon.titan-embed-text-v2:0',
      storageType,
      vectorBucketArn,
      saveToSsm = true,
      ssmPrefix = `/agentcore/${environment}`,
    } = props;

    // Validate props
    if (storageType === 'S3_VECTORS' && !vectorBucketArn) {
      throw new Error('vectorBucketArn is required when storageType is S3_VECTORS');
    }

    const region = cdk.Stack.of(this).region;
    const accountId = cdk.Stack.of(this).account;

    // Build embedding model ARN
    const embeddingModelArn = embeddingModelId.startsWith('arn:')
      ? embeddingModelId
      : `arn:aws:bedrock:${region}::foundation-model/${embeddingModelId}`;

    // Create Lambda handler for Custom Resource
    this.handlerFunction = new lambdaNodejs.NodejsFunction(this, 'Handler', {
      functionName: `bedrock-kb-handler-${environment}`,
      entry: path.join(
        __dirname,
        '../lambda/custom-resource-handlers/knowledge-base/index.ts'
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        AWS_ACCOUNT_ID: accountId,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
      },
    });

    // Grant permissions
    this.handlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          // Bedrock Agent operations
          'bedrock:CreateKnowledgeBase',
          'bedrock:GetKnowledgeBase',
          'bedrock:UpdateKnowledgeBase',
          'bedrock:DeleteKnowledgeBase',
          'bedrock:ListKnowledgeBases',
          'bedrock:CreateDataSource',
          'bedrock:GetDataSource',
          'bedrock:UpdateDataSource',
          'bedrock:DeleteDataSource',
          'bedrock:ListDataSources',
        ],
        resources: ['*'],
      })
    );

    // IAM permissions for role management
    this.handlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'iam:CreateRole',
          'iam:GetRole',
          'iam:DeleteRole',
          'iam:PutRolePolicy',
          'iam:DeleteRolePolicy',
          'iam:PassRole',
        ],
        resources: [`arn:aws:iam::${accountId}:role/bedrock-kb-role-*`],
      })
    );

    // Create Provider
    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: this.handlerFunction,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Create Custom Resource
    const customResource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::BedrockKnowledgeBase',
      properties: {
        Name: name,
        Environment: environment,
        DocumentsBucketArn: documentsBucketArn,
        DocumentsPrefix: documentsPrefix,
        EmbeddingModelArn: embeddingModelArn,
        StorageType: storageType,
        VectorBucketArn: vectorBucketArn,
        // Change detection hash
        ConfigHash: cdk.Fn.base64(
          JSON.stringify({
            name,
            documentsBucketArn,
            documentsPrefix,
            embeddingModelArn,
            storageType,
            vectorBucketArn,
          })
        ),
      },
    });

    // Extract outputs
    this.knowledgeBaseId = customResource.getAttString('KnowledgeBaseId');
    this.knowledgeBaseArn = customResource.getAttString('KnowledgeBaseArn');
    this.dataSourceId = customResource.getAttString('DataSourceId');
    this.roleArn = customResource.getAttString('RoleArn');

    // Save to SSM Parameter Store
    if (saveToSsm) {
      new ssm.StringParameter(this, 'KnowledgeBaseIdParam', {
        parameterName: `${ssmPrefix}/knowledge-base-id`,
        stringValue: this.knowledgeBaseId,
        description: `Bedrock Knowledge Base ID for ${environment}`,
      });

      new ssm.StringParameter(this, 'DataSourceIdParam', {
        parameterName: `${ssmPrefix}/data-source-id`,
        stringValue: this.dataSourceId,
        description: `Bedrock Data Source ID for ${environment}`,
      });
    }

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'KnowledgeBaseIdOutput', {
      value: this.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
      exportName: `${environment}-KnowledgeBaseId`,
    });

    new cdk.CfnOutput(this, 'DataSourceIdOutput', {
      value: this.dataSourceId,
      description: 'Bedrock Data Source ID',
      exportName: `${environment}-DataSourceId`,
    });
  }

  /**
   * Import an existing Knowledge Base by ID
   */
  static fromKnowledgeBaseId(
    scope: Construct,
    id: string,
    knowledgeBaseId: string
  ): IBedrockKnowledgeBase {
    class ImportedKnowledgeBase extends Construct implements IBedrockKnowledgeBase {
      public readonly knowledgeBaseId = knowledgeBaseId;
      public readonly knowledgeBaseArn = `arn:aws:bedrock:*:*:knowledge-base/${knowledgeBaseId}`;
    }
    return new ImportedKnowledgeBase(scope, id);
  }
}

/**
 * Interface for imported Knowledge Base
 */
export interface IBedrockKnowledgeBase {
  readonly knowledgeBaseId: string;
  readonly knowledgeBaseArn: string;
}
