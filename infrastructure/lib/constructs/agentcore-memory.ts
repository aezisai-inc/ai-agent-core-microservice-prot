/**
 * AgentCore Memory Construct
 *
 * Creates and manages AgentCore Memory Store using CloudFormation Custom Resource.
 * Provides complete IaC management with idempotency, status waiting, and proper lifecycle.
 *
 * @example
 * ```typescript
 * const memory = new AgentCoreMemory(this, 'Memory', {
 *   memoryName: 'agenticRagMemoryDev',
 *   environment: 'development',
 *   eventExpiryDuration: 30,
 * });
 *
 * // Use in other constructs
 * console.log(memory.memoryId);
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
 * Properties for AgentCoreMemory construct
 */
export interface AgentCoreMemoryProps {
  /**
   * Memory Store name
   *
   * Must match pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}
   * (Alphanumeric and underscore only, max 48 chars)
   */
  readonly memoryName: string;

  /**
   * Environment name (e.g., 'development', 'staging', 'production')
   */
  readonly environment: string;

  /**
   * Event expiry duration in days
   *
   * @default 30 for development, 90 for production
   */
  readonly eventExpiryDuration?: number;

  /**
   * AgentCore API region
   *
   * @default ap-northeast-1
   */
  readonly agentCoreRegion?: string;

  /**
   * Whether to save Memory ID to SSM Parameter Store
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
 * AgentCore Memory Construct
 *
 * Manages AgentCore Memory Store lifecycle through CloudFormation.
 */
export class AgentCoreMemory extends Construct {
  /**
   * Memory Store ID
   */
  public readonly memoryId: string;

  /**
   * Memory Store ARN
   */
  public readonly memoryArn: string;

  /**
   * Memory Store status
   */
  public readonly memoryStatus: string;

  /**
   * SSM Parameter for Memory ID (if saveToSsm is true)
   */
  public readonly ssmParameter?: ssm.StringParameter;

  /**
   * Custom Resource handler Lambda function
   */
  public readonly handlerFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AgentCoreMemoryProps) {
    super(scope, id);

    const {
      memoryName,
      environment,
      eventExpiryDuration = environment === 'production' ? 90 : 30,
      agentCoreRegion = 'ap-northeast-1',
      saveToSsm = true,
      ssmPrefix = `/agentcore/${environment}`,
    } = props;

    // Validate memory name
    this.validateMemoryName(memoryName);

    // Create Lambda handler for Custom Resource
    this.handlerFunction = new lambdaNodejs.NodejsFunction(this, 'Handler', {
      functionName: `agentcore-memory-handler-${environment}`,
      entry: path.join(
        __dirname,
        '../lambda/custom-resource-handlers/agentcore-memory/index.ts'
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        AGENTCORE_REGION: agentCoreRegion,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        // Include required dependencies
        externalModules: [],
      },
    });

    // Grant permissions for AgentCore Memory operations
    this.handlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          // AgentCore Memory operations
          'bedrock-agentcore-control:CreateMemory',
          'bedrock-agentcore-control:GetMemory',
          'bedrock-agentcore-control:UpdateMemory',
          'bedrock-agentcore-control:DeleteMemory',
          'bedrock-agentcore-control:ListMemories',
          // Legacy API names (in case of API changes)
          'bedrock:CreateMemory',
          'bedrock:GetMemory',
          'bedrock:UpdateMemory',
          'bedrock:DeleteMemory',
          'bedrock:ListMemories',
        ],
        resources: ['*'],
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
      resourceType: 'Custom::AgentCoreMemory',
      properties: {
        MemoryName: memoryName,
        EventExpiryDuration: eventExpiryDuration,
        Environment: environment,
        // Add hash to detect property changes
        ConfigHash: cdk.Fn.base64(
          JSON.stringify({
            memoryName,
            eventExpiryDuration,
          })
        ),
      },
    });

    // Extract outputs from Custom Resource
    this.memoryId = customResource.getAttString('MemoryId');
    this.memoryArn = customResource.getAttString('MemoryArn');
    this.memoryStatus = customResource.getAttString('Status');

    // Save to SSM Parameter Store
    if (saveToSsm) {
      this.ssmParameter = new ssm.StringParameter(this, 'MemoryIdParameter', {
        parameterName: `${ssmPrefix}/memory-store-id`,
        stringValue: this.memoryId,
        description: `AgentCore Memory Store ID for ${environment}`,
      });
    }

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'MemoryIdOutput', {
      value: this.memoryId,
      description: 'AgentCore Memory Store ID',
      exportName: `${environment}-AgentCoreMemoryId`,
    });

    new cdk.CfnOutput(this, 'MemoryArnOutput', {
      value: this.memoryArn,
      description: 'AgentCore Memory Store ARN',
      exportName: `${environment}-AgentCoreMemoryArn`,
    });
  }

  /**
   * Validate memory name follows AgentCore naming rules
   */
  private validateMemoryName(name: string): void {
    const pattern = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;
    if (!pattern.test(name)) {
      throw new Error(
        `Invalid memory name: "${name}". ` +
          `Must match pattern [a-zA-Z][a-zA-Z0-9_]{0,47} ` +
          `(start with letter, alphanumeric and underscore only, max 48 chars)`
      );
    }
  }

  /**
   * Import an existing Memory Store by ID
   *
   * @param scope - Construct scope
   * @param id - Construct ID
   * @param memoryId - Existing Memory Store ID
   */
  static fromMemoryId(
    scope: Construct,
    id: string,
    memoryId: string
  ): IAgentCoreMemory {
    class ImportedMemory extends Construct implements IAgentCoreMemory {
      public readonly memoryId = memoryId;
      public readonly memoryArn = `arn:aws:bedrock-agentcore:*:*:memory/${memoryId}`;
    }
    return new ImportedMemory(scope, id);
  }
}

/**
 * Interface for imported AgentCore Memory
 */
export interface IAgentCoreMemory {
  readonly memoryId: string;
  readonly memoryArn: string;
}
