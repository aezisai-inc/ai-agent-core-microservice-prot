/**
 * AgentCore Stack
 * 
 * AgentCore Runtime のデプロイ設定
 * L2 Construct (@aws-cdk/aws-bedrock-agentcore-alpha) を使用して
 * AgentCore Runtime を CDK で管理
 */

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
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
  /** Cognito User Pool (認証用) */
  userPool?: cognito.IUserPool;
  /** Cognito User Pool Client (認証用) */
  userPoolClient?: cognito.IUserPoolClient;
  /** Knowledge Base ID (RAG用) */
  knowledgeBaseId?: string;
}

export class AgentCoreStack extends cdk.Stack {
  /** AgentCore Runtime */
  public readonly agentRuntime: agentcore.Runtime;
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
      bedrockModelId = 'apac.amazon.nova-pro-v1:0',
      userPool,
      userPoolClient,
      knowledgeBaseId,
    } = props;

    // ============================================
    // IAM Role (カスタムロール)
    // ============================================
    
    // AgentCore Runtime 実行用 IAM ロール
    this.agentRole = new iam.Role(this, 'AgentCoreRuntimeRole', {
      roleName: `agentcore-runtime-role-${environment}`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('bedrock.amazonaws.com'),
        new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
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

    // Bedrock Knowledge Base (RAG) 権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`,
      ],
    }));

    // AgentCore Memory アクセス権限
    this.agentRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
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

    // ============================================
    // AgentCore Runtime (L2 Construct)
    // ============================================

    // 認証設定
    let authorizerConfig: agentcore.RuntimeAuthorizerConfiguration | undefined;
    if (userPool && userPoolClient) {
      authorizerConfig = agentcore.RuntimeAuthorizerConfiguration.usingCognito(
        userPool,
        [userPoolClient],
      );
    }
    // Cognito が設定されていない場合は IAM 認証（デフォルト）

    // 環境変数
    const environmentVariables: { [key: string]: string } = {
      'AGENTCORE_ENV': environment,
      'AWS_REGION': this.region,
      'BEDROCK_MODEL_ID': bedrockModelId,
    };

    // Knowledge Base ID が設定されている場合は環境変数に追加
    // Note: SSM から取得する方が柔軟だが、CDK での設定も可能
    if (knowledgeBaseId) {
      environmentVariables['KNOWLEDGE_BASE_ID'] = knowledgeBaseId;
    }

    // AgentCore Runtime を作成
    this.agentRuntime = new agentcore.Runtime(this, 'AgentCoreRuntime', {
      runtimeName: `agentcoreRuntime${this.capitalize(environment)}`,
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromEcrRepository(
        ecrRepository,
        'latest',
      ),
      executionRole: this.agentRole,
      networkConfiguration: agentcore.RuntimeNetworkConfiguration.usingPublicNetwork(),
      description: `Agentic RAG Agent Runtime - ${environment}`,
      environmentVariables,
      ...(authorizerConfig && { authorizerConfiguration: authorizerConfig }),
      // ライフサイクル設定
      lifecycleConfiguration: {
        idleRuntimeSessionTimeout: cdk.Duration.minutes(15),
        maxLifetime: cdk.Duration.hours(8),
      },
    });

    // ============================================
    // SSM パラメータストア
    // ============================================

    this.configParameters = {};

    // Agent Runtime ID を SSM に保存
    this.configParameters['agentRuntimeId'] = new ssm.StringParameter(this, 'AgentRuntimeIdParam', {
      parameterName: `/agentcore/${environment}/agent-runtime-id`,
      stringValue: this.agentRuntime.agentRuntimeId,
      description: 'AgentCore Runtime ID',
    });

    // Agent Runtime ARN を SSM に保存
    this.configParameters['agentRuntimeArn'] = new ssm.StringParameter(this, 'AgentRuntimeArnParam', {
      parameterName: `/agentcore/${environment}/agent-runtime-arn`,
      stringValue: this.agentRuntime.agentRuntimeArn,
      description: 'AgentCore Runtime ARN',
    });

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

    // Knowledge Base ID を SSM に保存（設定されている場合）
    if (knowledgeBaseId) {
      this.configParameters['knowledgeBaseId'] = new ssm.StringParameter(this, 'KnowledgeBaseIdParam', {
        parameterName: `/agentcore/${environment}/knowledge-base-id`,
        stringValue: knowledgeBaseId,
        description: 'Bedrock Knowledge Base ID for RAG',
      });
    }

    // ============================================
    // 出力
    // ============================================

    new cdk.CfnOutput(this, 'AgentRoleArn', {
      value: this.agentRole.roleArn,
      description: 'AgentCore Runtime IAM Role ARN',
      exportName: `${environment}-AgentCoreRuntimeRoleArn`,
    });

    new cdk.CfnOutput(this, 'AgentRuntimeId', {
      value: this.agentRuntime.agentRuntimeId,
      description: 'AgentCore Runtime ID',
      exportName: `${environment}-AgentCoreRuntimeId`,
    });

    new cdk.CfnOutput(this, 'AgentRuntimeArn', {
      value: this.agentRuntime.agentRuntimeArn,
      description: 'AgentCore Runtime ARN',
      exportName: `${environment}-AgentCoreRuntimeArn`,
    });

    new cdk.CfnOutput(this, 'ConfigParameterPath', {
      value: `/agentcore/${environment}/`,
      description: 'SSM Parameter Store path for AgentCore config',
      exportName: `${environment}-AgentCoreConfigPath`,
    });
  }

  /**
   * 文字列の先頭を大文字にする
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
