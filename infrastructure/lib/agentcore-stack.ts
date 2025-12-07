/**
 * AgentCore Stack
 * 
 * AgentCore Runtime のデプロイ設定
 * ECRイメージを使用してAgentCore Runtimeを構成
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface AgentCoreStackProps extends cdk.StackProps {
  /** 環境名 (dev/staging/prod) */
  environment: string;
  /** ECRリポジトリ */
  ecrRepository: ecr.IRepository;
  /** メモリストアID */
  memoryStoreId: string;
  /** Bedrockモデル ID */
  bedrockModelId?: string;
}

export class AgentCoreStack extends cdk.Stack {
  /** AgentCore Runtime IAM ロール */
  public readonly agentRole: iam.Role;
  /** AgentCore 設定パラメータ */
  public readonly configParameters: { [key: string]: ssm.StringParameter };

  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    const {
      environment,
      ecrRepository,
      memoryStoreId,
      bedrockModelId = 'us.amazon.nova-pro-v1:0',
    } = props;

    // AgentCore Runtime 実行用 IAM ロール
    this.agentRole = new iam.Role(this, 'AgentCoreRuntimeRole', {
      roleName: `agentcore-runtime-role-${environment}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('bedrock.amazonaws.com'),
        new iam.ServicePrincipal('lambda.amazonaws.com'),
      ),
      description: 'IAM role for AgentCore Runtime execution',
    });

    // Bedrock モデル呼び出し権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
      ],
    }));

    // AgentCore Memory アクセス権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agent:RetrieveAndGenerate',
        'bedrock-agent:Retrieve',
        'bedrock-agentcore:*',
      ],
      resources: ['*'],
    }));

    // ECR イメージ Pull 権限
    ecrRepository.grantPull(this.agentRole);

    // CloudWatch Logs 権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/agentcore/*`,
      ],
    }));

    // X-Ray トレーシング権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
      ],
      resources: ['*'],
    }));

    // SSM パラメータ読み取り権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/agentcore/${environment}/*`,
      ],
    }));

    // Secrets Manager 読み取り権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:agentcore/${environment}/*`,
      ],
    }));

    // SSM パラメータストアに設定を保存
    this.configParameters = {};

    this.configParameters['memoryStoreId'] = new ssm.StringParameter(this, 'MemoryStoreIdParam', {
      parameterName: `/agentcore/${environment}/memory-store-id`,
      stringValue: memoryStoreId,
      description: 'AgentCore Memory Store ID',
    });

    this.configParameters['bedrockModelId'] = new ssm.StringParameter(this, 'BedrockModelIdParam', {
      parameterName: `/agentcore/${environment}/bedrock-model-id`,
      stringValue: bedrockModelId,
      description: 'Bedrock Model ID for AgentCore Runtime',
    });

    this.configParameters['ecrRepositoryUri'] = new ssm.StringParameter(this, 'EcrRepositoryUriParam', {
      parameterName: `/agentcore/${environment}/ecr-repository-uri`,
      stringValue: ecrRepository.repositoryUri,
      description: 'ECR Repository URI for AgentCore Runtime',
    });

    this.configParameters['environment'] = new ssm.StringParameter(this, 'EnvironmentParam', {
      parameterName: `/agentcore/${environment}/environment`,
      stringValue: environment,
      description: 'Deployment environment',
    });

    // 出力
    new cdk.CfnOutput(this, 'AgentRoleArn', {
      value: this.agentRole.roleArn,
      description: 'AgentCore Runtime IAM Role ARN',
      exportName: `${environment}-AgentCoreRuntimeRoleArn`,
    });

    new cdk.CfnOutput(this, 'ConfigParameterPath', {
      value: `/agentcore/${environment}/`,
      description: 'SSM Parameter Store path for AgentCore config',
      exportName: `${environment}-AgentCoreConfigPath`,
    });
  }
}
