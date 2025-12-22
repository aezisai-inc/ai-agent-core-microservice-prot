/**
 * Pipeline Stack
 * 
 * AWS CodePipeline CI/CD パイプライン
 * Backend (AgentCore) と Frontend (Amplify) のデプロイを自動化
 */

import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  /** 環境名 (dev/staging/prod) */
  environment: string;
  /** GitHub リポジトリオーナー */
  githubOwner: string;
  /** GitHub リポジトリ名 */
  githubRepo: string;
  /** GitHub ブランチ名 */
  githubBranch: string;
  /** GitHub Connection ARN (CodeStar Connections) */
  githubConnectionArn: string;
  /** ECRリポジトリ */
  ecrRepository: ecr.IRepository;
}

export class PipelineStack extends cdk.Stack {
  /** CI/CD パイプライン */
  public readonly pipeline: codepipeline.Pipeline;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const {
      environment,
      githubOwner,
      githubRepo,
      githubBranch,
      githubConnectionArn,
      ecrRepository,
    } = props;

    // アーティファクトバケット
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `agentcore-pipeline-artifacts-${this.account}-${environment}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
    });

    // ソースアーティファクト
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    // CodeBuild - Backend Build
    const backendBuildProject = new codebuild.PipelineProject(this, 'BackendBuild', {
      projectName: `agentcore-backend-build-${environment}`,
      description: 'Build AgentCore Runtime Docker image',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true, // Docker build に必要
        computeType: codebuild.ComputeType.MEDIUM,
      },
      environmentVariables: {
        ECR_REPOSITORY_URI: {
          value: ecrRepository.repositoryUri,
        },
        AWS_ACCOUNT_ID: {
          value: this.account,
        },
        AWS_REGION: {
          value: this.region,
        },
        ENVIRONMENT: {
          value: environment,
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com',
              'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
              'IMAGE_TAG=${COMMIT_HASH:=latest}',
            ],
          },
          build: {
            commands: [
              'echo Building the Docker image...',
              'cd backend',
              'docker build -t $ECR_REPOSITORY_URI:latest .',
              'docker tag $ECR_REPOSITORY_URI:latest $ECR_REPOSITORY_URI:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Pushing the Docker image...',
              'docker push $ECR_REPOSITORY_URI:latest',
              'docker push $ECR_REPOSITORY_URI:$IMAGE_TAG',
              'echo Writing image definitions file...',
              'printf \'{"ImageURI":"%s"}\' $ECR_REPOSITORY_URI:$IMAGE_TAG > imageDefinitions.json',
            ],
          },
        },
        artifacts: {
          files: ['imageDefinitions.json'],
          'base-directory': 'backend',
        },
      }),
      cache: codebuild.Cache.local(
        codebuild.LocalCacheMode.DOCKER_LAYER,
        codebuild.LocalCacheMode.CUSTOM
      ),
    });

    // CodeBuild に ECR 権限を付与
    ecrRepository.grantPullPush(backendBuildProject);

    // CodeBuild - Test
    const testProject = new codebuild.PipelineProject(this, 'TestProject', {
      projectName: `agentcore-test-${environment}`,
      description: 'Run backend tests',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              python: '3.11',
            },
            commands: [
              'cd backend',
              'pip install -e ".[dev]"',
            ],
          },
          build: {
            commands: [
              'cd backend',
              'python -m pytest tests/ -v --tb=short',
            ],
          },
        },
        reports: {
          pytest_reports: {
            files: ['**/test-results.xml'],
            'file-format': 'JUNITXML',
          },
        },
      }),
    });

    // パイプライン作成
    this.pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `agentcore-pipeline-${environment}`,
      artifactBucket,
      restartExecutionOnUpdate: true,
    });

    // ソースステージ
    this.pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub_Source',
          owner: githubOwner,
          repo: githubRepo,
          branch: githubBranch,
          output: sourceOutput,
          connectionArn: githubConnectionArn,
          triggerOnPush: true,
        }),
      ],
    });

    // テストステージ
    this.pipeline.addStage({
      stageName: 'Test',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Backend_Test',
          project: testProject,
          input: sourceOutput,
        }),
      ],
    });

    // ビルドステージ
    this.pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Backend_Build',
          project: backendBuildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // 本番環境の場合は承認ステージを追加
    if (environment === 'prod') {
      this.pipeline.addStage({
        stageName: 'Approval',
        actions: [
          new codepipeline_actions.ManualApprovalAction({
            actionName: 'Manual_Approval',
            additionalInformation: 'Review and approve deployment to production',
          }),
        ],
      });
    }

    // 出力
    new cdk.CfnOutput(this, 'PipelineArn', {
      value: this.pipeline.pipelineArn,
      description: 'CI/CD Pipeline ARN',
      exportName: `${environment}-AgentCorePipelineArn`,
    });

    new cdk.CfnOutput(this, 'ArtifactBucketName', {
      value: artifactBucket.bucketName,
      description: 'Pipeline Artifact Bucket',
      exportName: `${environment}-PipelineArtifactBucket`,
    });
  }
}
