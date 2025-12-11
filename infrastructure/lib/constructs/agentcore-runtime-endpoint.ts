/**
 * AgentCore Runtime Endpoint Construct
 *
 * Creates and manages AgentCore Runtime Endpoint using CloudFormation Custom Resource.
 *
 * @example
 * ```typescript
 * const endpoint = new AgentCoreRuntimeEndpoint(this, 'Endpoint', {
 *   agentRuntimeId: runtime.agentRuntimeId,
 *   endpointName: 'agentcoreEndpointDev',
 *   environment: 'development',
 * });
 *
 * console.log(endpoint.endpointUrl);
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
 * Properties for AgentCoreRuntimeEndpoint construct
 */
export interface AgentCoreRuntimeEndpointProps {
  /**
   * Agent Runtime ID to create endpoint for
   */
  readonly agentRuntimeId: string;

  /**
   * Endpoint name
   *
   * Must match pattern: [a-zA-Z][a-zA-Z0-9_]{0,47}
   */
  readonly endpointName: string;

  /**
   * Environment name
   */
  readonly environment: string;

  /**
   * AgentCore API region
   *
   * @default ap-northeast-1
   */
  readonly agentCoreRegion?: string;

  /**
   * Whether to save Endpoint URL to SSM Parameter Store
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
 * AgentCore Runtime Endpoint Construct
 */
export class AgentCoreRuntimeEndpoint extends Construct {
  /**
   * Endpoint ID
   */
  public readonly endpointId: string;

  /**
   * Live Endpoint URL
   */
  public readonly endpointUrl: string;

  /**
   * Custom Resource handler Lambda function
   */
  public readonly handlerFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeEndpointProps) {
    super(scope, id);

    const {
      agentRuntimeId,
      endpointName,
      environment,
      agentCoreRegion = 'ap-northeast-1',
      saveToSsm = true,
      ssmPrefix = `/agentcore/${environment}`,
    } = props;

    // Validate endpoint name
    this.validateEndpointName(endpointName);

    // Create Lambda handler
    this.handlerFunction = new lambdaNodejs.NodejsFunction(this, 'Handler', {
      functionName: `agentcore-endpoint-handler-${environment}`,
      entry: path.join(
        __dirname,
        '../lambda/custom-resource-handlers/runtime-endpoint/index.ts'
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
      },
    });

    // Grant permissions
    this.handlerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore-control:CreateAgentRuntimeEndpoint',
          'bedrock-agentcore-control:GetAgentRuntimeEndpoint',
          'bedrock-agentcore-control:UpdateAgentRuntimeEndpoint',
          'bedrock-agentcore-control:DeleteAgentRuntimeEndpoint',
          'bedrock-agentcore-control:ListAgentRuntimeEndpoints',
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
      resourceType: 'Custom::AgentCoreRuntimeEndpoint',
      properties: {
        AgentRuntimeId: agentRuntimeId,
        EndpointName: endpointName,
        Environment: environment,
        ConfigHash: cdk.Fn.base64(
          JSON.stringify({
            agentRuntimeId,
            endpointName,
          })
        ),
      },
    });

    // Extract outputs
    this.endpointId = customResource.getAttString('EndpointId');
    this.endpointUrl = customResource.getAttString('EndpointUrl');

    // Save to SSM Parameter Store
    if (saveToSsm) {
      new ssm.StringParameter(this, 'EndpointIdParam', {
        parameterName: `${ssmPrefix}/agent-endpoint-id`,
        stringValue: this.endpointId,
        description: `AgentCore Runtime Endpoint ID for ${environment}`,
      });

      new ssm.StringParameter(this, 'EndpointUrlParam', {
        parameterName: `${ssmPrefix}/agent-endpoint-url`,
        stringValue: this.endpointUrl,
        description: `AgentCore Runtime Endpoint URL for ${environment}`,
      });
    }

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'EndpointIdOutput', {
      value: this.endpointId,
      description: 'AgentCore Runtime Endpoint ID',
      exportName: `${environment}-AgentCoreEndpointId`,
    });

    new cdk.CfnOutput(this, 'EndpointUrlOutput', {
      value: this.endpointUrl,
      description: 'AgentCore Runtime Endpoint URL',
      exportName: `${environment}-AgentCoreEndpointUrl`,
    });
  }

  /**
   * Validate endpoint name
   */
  private validateEndpointName(name: string): void {
    const pattern = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;
    if (!pattern.test(name)) {
      throw new Error(
        `Invalid endpoint name: "${name}". ` +
          `Must match pattern [a-zA-Z][a-zA-Z0-9_]{0,47}`
      );
    }
  }
}
