#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  AgenticRagStack,
  EcrStack,
  MemoryStack,
  AgentCoreStack,
  PipelineStack,
} from "../lib";

const app = new cdk.App();

// 環境設定
const environment = process.env.ENVIRONMENT || "development";
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "ap-northeast-1",
};

const tags = {
  Project: "agentic-rag",
  Environment: environment,
  ManagedBy: "CDK",
};

// 1. メインスタック (DynamoDB, S3, KMS)
const mainStack = new AgenticRagStack(app, `AgenticRag-${environment}`, {
  env,
  description: "Agentic RAG Main Resources - DynamoDB, S3, KMS",
  tags,
  environment,
});

// 2. ECR スタック
const ecrStack = new EcrStack(app, `AgenticRag-ECR-${environment}`, {
  env,
  description: "ECR Repository for AgentCore Runtime",
  tags,
  environment,
  imageRetentionDays: environment === "prod" ? 90 : 30,
});

// 3. Memory スタック (AgentCore Memory Store)
const memoryStack = new MemoryStack(app, `AgenticRag-Memory-${environment}`, {
  env,
  description: "AgentCore Memory Store",
  tags,
  environment,
});

// 4. AgentCore スタック (IAM, SSM)
const agentCoreStack = new AgentCoreStack(app, `AgenticRag-AgentCore-${environment}`, {
  env,
  description: "AgentCore Runtime Configuration",
  tags,
  environment,
  ecrRepository: ecrStack.agentRepository,
  memoryStoreId: memoryStack.memoryStoreId,
  bedrockModelId: process.env.BEDROCK_MODEL_ID || "us.amazon.nova-pro-v1:0",
});
agentCoreStack.addDependency(ecrStack);
agentCoreStack.addDependency(memoryStack);

// 5. Pipeline スタック (オプション - GitHub Connection が設定されている場合のみ)
const githubConnectionArn = process.env.GITHUB_CONNECTION_ARN;
if (githubConnectionArn) {
  const pipelineStack = new PipelineStack(app, `AgenticRag-Pipeline-${environment}`, {
    env,
    description: "CI/CD Pipeline for AgentCore",
    tags,
    environment,
    githubOwner: process.env.GITHUB_OWNER || "aezisai-inc",
    githubRepo: process.env.GITHUB_REPO || "ai-agent-core-microservice-prot",
    githubBranch: environment === "prod" ? "main" : "develop",
    githubConnectionArn,
    ecrRepository: ecrStack.agentRepository,
  });
  pipelineStack.addDependency(ecrStack);
}

// スタック一覧出力
console.log(`
=== Agentic RAG Infrastructure ===
Environment: ${environment}
Region: ${env.region}
Stacks:
  - AgenticRag-${environment} (Main)
  - AgenticRag-ECR-${environment}
  - AgenticRag-Memory-${environment}
  - AgenticRag-AgentCore-${environment}
  ${githubConnectionArn ? `- AgenticRag-Pipeline-${environment}` : ""}
`);

