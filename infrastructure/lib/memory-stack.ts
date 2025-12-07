/**
 * Memory Stack
 * 
 * AgentCore Memory Store のプロビジョニング
 * Custom Resource を使用して AgentCore CLI でメモリストアを作成
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface MemoryStackProps extends cdk.StackProps {
  /** 環境名 (dev/staging/prod) */
  environment: string;
  /** メモリストア名 */
  memoryStoreName?: string;
}

export class MemoryStack extends cdk.Stack {
  /** メモリストア ID */
  public readonly memoryStoreId: string;
  /** メモリストア ARN */
  public readonly memoryStoreArn: string;

  constructor(scope: Construct, id: string, props: MemoryStackProps) {
    super(scope, id, props);

    const { environment, memoryStoreName = `agentic-rag-memory-${environment}` } = props;

    // AgentCore Memory 操作用 Lambda
    const memoryProviderLambda = new lambda.Function(this, 'MemoryProviderLambda', {
      functionName: `agentcore-memory-provider-${environment}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      code: lambda.Code.fromInline(this.getMemoryProviderCode()),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Lambda に AgentCore 操作権限を付与
    memoryProviderLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:*',
        'bedrock-agent:*',
      ],
      resources: ['*'],
    }));

    // Custom Resource Provider
    const provider = new cr.Provider(this, 'MemoryProvider', {
      onEventHandler: memoryProviderLambda,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Memory Store Custom Resource
    const memoryStore = new cdk.CustomResource(this, 'AgentCoreMemoryStore', {
      serviceToken: provider.serviceToken,
      properties: {
        MemoryStoreName: memoryStoreName,
        Strategies: [
          { type: 'semantic', name: 'semanticFacts' },
          { type: 'episodic', name: 'episodicLearning' },
        ],
        Environment: environment,
      },
    });

    // 出力値を設定
    this.memoryStoreId = memoryStore.getAttString('MemoryStoreId');
    this.memoryStoreArn = memoryStore.getAttString('MemoryStoreArn');

    // CloudFormation 出力
    new cdk.CfnOutput(this, 'MemoryStoreId', {
      value: this.memoryStoreId,
      description: 'AgentCore Memory Store ID',
      exportName: `${environment}-AgentCoreMemoryStoreId`,
    });

    new cdk.CfnOutput(this, 'MemoryStoreArn', {
      value: this.memoryStoreArn,
      description: 'AgentCore Memory Store ARN',
      exportName: `${environment}-AgentCoreMemoryStoreArn`,
    });
  }

  /**
   * Memory Provider Lambda のコードを生成
   */
  private getMemoryProviderCode(): string {
    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    return `
import json
import boto3
import cfnresponse

def handler(event, context):
    """
    Custom Resource Handler for AgentCore Memory Store
    
    AgentCore Memory Store の作成/更新/削除を処理
    """
    try:
        request_type = event['RequestType']
        properties = event['ResourceProperties']
        
        store_name = properties.get('MemoryStoreName', 'default-memory')
        strategies = properties.get('Strategies', [])
        
        # AgentCore Memory API クライアント
        # Note: 実際のAPIが利用可能になったら bedrock-agentcore SDK を使用
        client = boto3.client('bedrock-agent', region_name='${region}')
        
        if request_type == 'Create':
            # メモリストア作成
            # Note: 実際のAPI呼び出しに置き換え
            response = {
                'memoryStoreId': store_name + '-id',
                'memoryStoreArn': 'arn:aws:bedrock-agentcore:${region}:${account}:memory-store/' + store_name
            }
            
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                'MemoryStoreId': response['memoryStoreId'],
                'MemoryStoreArn': response['memoryStoreArn'],
            }, response['memoryStoreId'])
            
        elif request_type == 'Update':
            # メモリストア更新
            physical_id = event.get('PhysicalResourceId')
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                'MemoryStoreId': physical_id,
            }, physical_id)
            
        elif request_type == 'Delete':
            # メモリストア削除
            physical_id = event.get('PhysicalResourceId')
            # Note: 実際の削除処理
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {}, physical_id)
            
    except Exception as e:
        print('Error: ' + str(e))
        cfnresponse.send(event, context, cfnresponse.FAILED, {'Error': str(e)})
`;
  }
}
