/**
 * ECR Stack
 * 
 * AgentCore Runtime 用のECRリポジトリを定義
 */

import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EcrStackProps extends cdk.StackProps {
  /** 環境名 (dev/staging/prod) */
  environment: string;
  /** イメージの保持日数 */
  imageRetentionDays?: number;
}

export class EcrStack extends cdk.Stack {
  /** AgentCore Runtime ECRリポジトリ */
  public readonly agentRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    const { environment, imageRetentionDays = 30 } = props;

    // AgentCore Runtime 用 ECR リポジトリ
    this.agentRepository = new ecr.Repository(this, 'AgentCoreRepository', {
      repositoryName: `agentic-rag-agent-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      encryption: ecr.RepositoryEncryption.KMS,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: environment !== 'prod',
    });

    // ライフサイクルポリシー（古いイメージを削除）
    this.agentRepository.addLifecycleRule({
      description: 'Remove untagged images',
      rulePriority: 1,
      tagStatus: ecr.TagStatus.UNTAGGED,
      maxImageAge: cdk.Duration.days(1),
    });

    // 開発環境用の追加ポリシー
    if (environment !== 'prod') {
      this.agentRepository.addLifecycleRule({
        description: 'Remove old development images',
        rulePriority: 2,
        tagPrefixList: ['dev-', 'feature-'],
        maxImageAge: cdk.Duration.days(imageRetentionDays),
      });
    }

    // TagStatus.ANY は常に最後（最大の優先度）にする必要がある
    this.agentRepository.addLifecycleRule({
      description: 'Keep limited number of images',
      rulePriority: 100,
      tagStatus: ecr.TagStatus.ANY,
      maxImageCount: 10,
    });

    // CodeBuild からのプッシュ権限
    this.agentRepository.grantPullPush(
      new iam.ServicePrincipal('codebuild.amazonaws.com')
    );

    // 出力
    new cdk.CfnOutput(this, 'AgentRepositoryUri', {
      value: this.agentRepository.repositoryUri,
      description: 'AgentCore Runtime ECR Repository URI',
      exportName: `${environment}-AgentCoreRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'AgentRepositoryArn', {
      value: this.agentRepository.repositoryArn,
      description: 'AgentCore Runtime ECR Repository ARN',
      exportName: `${environment}-AgentCoreRepositoryArn`,
    });
  }
}
