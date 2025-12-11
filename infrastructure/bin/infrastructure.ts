#!/usr/bin/env node
/**
 * Agentic RAG Infrastructure Entry Point
 *
 * CDK Application that deploys:
 * - Main Stack (DynamoDB, S3, KMS)
 * - ECR Stack (Container Registry)
 * - Memory Stack (AgentCore Memory Store - Custom Resource)
 * - Knowledge Base Stack (Bedrock KB with S3 Vectors - Custom Resource)
 * - AgentCore Stack (Runtime with L2 Construct)
 * - Pipeline Stack (CI/CD)
 *
 * @see docs/architecture/iac-custom-resource-design.md
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {
  AgenticRagStack,
  EcrStack,
  MemoryStack,
  KnowledgeBaseStack,
  AgentCoreStack,
  PipelineStack,
} from '../lib';

const app = new cdk.App();

// 環境設定
const environment = process.env.ENVIRONMENT || 'development';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

const tags = {
  Project: 'agentic-rag',
  Environment: environment,
  ManagedBy: 'CDK',
};

// Feature flags
const enableMemoryStack = process.env.ENABLE_MEMORY_STACK !== 'false';
const enableKnowledgeBaseStack = process.env.ENABLE_KB_STACK !== 'false';

// ============================================
// 1. メインスタック (DynamoDB, S3, KMS)
// ============================================
const mainStack = new AgenticRagStack(app, `AgenticRag-${environment}`, {
  env,
  description: 'Agentic RAG Main Resources - DynamoDB, S3, KMS',
  tags,
  environment,
});

// ============================================
// 2. ECR スタック
// ============================================
const ecrStack = new EcrStack(app, `AgenticRag-ECR-${environment}`, {
  env,
  description: 'ECR Repository for AgentCore Runtime',
  tags,
  environment,
  imageRetentionDays: environment === 'production' ? 90 : 30,
});

// ============================================
// 3. Memory スタック (AgentCore Memory Store)
// ============================================
let memoryStack: MemoryStack | undefined;
if (enableMemoryStack) {
  memoryStack = new MemoryStack(app, `AgenticRag-Memory-${environment}`, {
    env,
    description: 'AgentCore Memory Store - IaC Managed via Custom Resource',
    tags,
    environment,
    eventExpiryDuration: environment === 'production' ? 90 : 30,
  });
}

// ============================================
// 4. Knowledge Base スタック (Bedrock KB with S3 Vectors)
// ============================================
let knowledgeBaseStack: KnowledgeBaseStack | undefined;
if (enableKnowledgeBaseStack) {
  knowledgeBaseStack = new KnowledgeBaseStack(
    app,
    `AgenticRag-KnowledgeBase-${environment}`,
    {
      env,
      description: 'Bedrock Knowledge Base - IaC Managed via Custom Resource',
      tags,
      environment,
      storageType: 'S3_VECTORS',
      embeddingModelId: 'amazon.titan-embed-text-v2:0',
    }
  );
}

// ============================================
// 5. AgentCore スタック (Runtime with L2 Construct)
// ============================================
const agentCoreStack = new AgentCoreStack(
  app,
  `AgenticRag-AgentCore-${environment}`,
  {
    env,
    description: 'AgentCore Runtime Configuration',
    tags,
    environment,
    ecrRepository: ecrStack.agentRepository,
    // Use Memory Store ID from Custom Resource if available
    memoryStoreId: memoryStack?.memoryStoreId ?? 'placeholder-memory-store',
    bedrockModelId: process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-pro-v1:0',
    // Pass Knowledge Base ID if available
    knowledgeBaseId: knowledgeBaseStack?.knowledgeBaseId,
  }
);

// Stack dependencies
agentCoreStack.addDependency(ecrStack);
if (memoryStack) {
  agentCoreStack.addDependency(memoryStack);
}
if (knowledgeBaseStack) {
  agentCoreStack.addDependency(knowledgeBaseStack);
}

// ============================================
// 6. Pipeline スタック (オプション)
// ============================================
const githubConnectionArn = process.env.GITHUB_CONNECTION_ARN;
if (githubConnectionArn) {
  const pipelineStack = new PipelineStack(
    app,
    `AgenticRag-Pipeline-${environment}`,
    {
      env,
      description: 'CI/CD Pipeline for AgentCore',
      tags,
      environment,
      githubOwner: process.env.GITHUB_OWNER || 'aezisai-inc',
      githubRepo: process.env.GITHUB_REPO || 'ai-agent-core-microservice-prot',
      githubBranch: environment === 'production' ? 'main' : 'develop',
      githubConnectionArn,
      ecrRepository: ecrStack.agentRepository,
    }
  );
  pipelineStack.addDependency(ecrStack);
}

// ============================================
// スタック一覧出力
// ============================================
console.log(`
================================================================================
  Agentic RAG Infrastructure
================================================================================
  Environment:  ${environment}
  Region:       ${env.region}
  Account:      ${env.account}
--------------------------------------------------------------------------------
  Stacks:
    ✅ AgenticRag-${environment} (Main: DynamoDB, S3, KMS)
    ✅ AgenticRag-ECR-${environment}
    ${enableMemoryStack ? '✅' : '⏭️ '} AgenticRag-Memory-${environment} (Custom Resource)
    ${enableKnowledgeBaseStack ? '✅' : '⏭️ '} AgenticRag-KnowledgeBase-${environment} (Custom Resource)
    ✅ AgenticRag-AgentCore-${environment} (L2 Construct)
    ${githubConnectionArn ? '✅' : '⏭️ '} AgenticRag-Pipeline-${environment}
--------------------------------------------------------------------------------
  Feature Flags:
    ENABLE_MEMORY_STACK=${enableMemoryStack}
    ENABLE_KB_STACK=${enableKnowledgeBaseStack}
    GITHUB_CONNECTION_ARN=${githubConnectionArn ? 'configured' : 'not set'}
================================================================================
`);
