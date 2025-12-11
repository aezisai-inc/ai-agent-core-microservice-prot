/**
 * Memory Stack
 *
 * AgentCore Memory Store のプロビジョニング
 * Custom Resource Construct を使用して AgentCore Memory Store を IaC 管理
 *
 * @see docs/architecture/iac-custom-resource-design.md
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AgentCoreMemory } from './constructs';

export interface MemoryStackProps extends cdk.StackProps {
  /**
   * 環境名 (development/staging/production)
   */
  environment: string;

  /**
   * メモリストア名
   *
   * @default agenticRagMemory{Environment}
   */
  memoryStoreName?: string;

  /**
   * イベント有効期限（日数）
   *
   * @default 30 for development, 90 for production
   */
  eventExpiryDuration?: number;

  /**
   * AgentCore APIリージョン
   *
   * @default ap-northeast-1
   */
  agentCoreRegion?: string;
}

/**
 * AgentCore Memory Stack
 *
 * Creates and manages AgentCore Memory Store using CDK Custom Resource.
 * All resources are managed through CloudFormation for complete IaC.
 */
export class MemoryStack extends cdk.Stack {
  /**
   * Memory Store ID
   */
  public readonly memoryStoreId: string;

  /**
   * Memory Store ARN
   */
  public readonly memoryStoreArn: string;

  /**
   * AgentCore Memory Construct
   */
  public readonly memory: AgentCoreMemory;

  constructor(scope: Construct, id: string, props: MemoryStackProps) {
    super(scope, id, props);

    const {
      environment,
      memoryStoreName = `agenticRagMemory${this.capitalize(environment)}`,
      eventExpiryDuration,
      agentCoreRegion = 'ap-northeast-1',
    } = props;

    // Create AgentCore Memory using Custom Resource Construct
    this.memory = new AgentCoreMemory(this, 'AgentCoreMemory', {
      memoryName: memoryStoreName,
      environment,
      eventExpiryDuration,
      agentCoreRegion,
      saveToSsm: true,
      ssmPrefix: `/agentcore/${environment}`,
    });

    // Expose values
    this.memoryStoreId = this.memory.memoryId;
    this.memoryStoreArn = this.memory.memoryArn;

    // Stack-level outputs (in addition to construct outputs)
    new cdk.CfnOutput(this, 'StackMemoryStoreId', {
      value: this.memoryStoreId,
      description: 'AgentCore Memory Store ID (Stack Output)',
    });

    // Tags
    cdk.Tags.of(this).add('Component', 'AgentCoreMemory');
    cdk.Tags.of(this).add('ManagedBy', 'CDK-CustomResource');
  }

  /**
   * 文字列の先頭を大文字にする
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
