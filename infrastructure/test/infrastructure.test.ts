/**
 * Infrastructure CDK Tests
 */

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AgenticRagStack } from '../lib/agentic-rag-stack';
import { EcrStack } from '../lib/ecr-stack';

describe('AgenticRagStack', () => {
  let app: cdk.App;
  let stack: AgenticRagStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new AgenticRagStack(app, 'TestStack', {
      environment: 'test',
    });
    template = Template.fromStack(stack);
  });

  test('creates DynamoDB Events table', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'agentic-rag-events-test',
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('creates DynamoDB Read Models table', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'agentic-rag-read-models-test',
    });
  });

  test('creates S3 buckets', () => {
    template.resourceCountIs('AWS::S3::Bucket', 2);
  });

  test('creates KMS encryption key', () => {
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  test('creates required outputs', () => {
    template.hasOutput('EventsTableName', {});
    template.hasOutput('ReadModelsTableName', {});
    template.hasOutput('DocumentsBucketName', {});
    template.hasOutput('VectorBucketName', {});
  });
});

describe('EcrStack', () => {
  let app: cdk.App;
  let stack: EcrStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new EcrStack(app, 'TestEcrStack', {
      environment: 'test',
    });
    template = Template.fromStack(stack);
  });

  test('creates ECR repository', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'agentic-rag-agent-test',
      ImageScanningConfiguration: {
        ScanOnPush: true,
      },
    });
  });

  test('creates outputs', () => {
    template.hasOutput('AgentRepositoryUri', {});
    template.hasOutput('AgentRepositoryArn', {});
  });
});
