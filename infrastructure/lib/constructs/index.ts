/**
 * Custom Constructs for AgentCore Infrastructure
 *
 * These constructs provide IaC management for AWS resources that
 * don't have native CloudFormation support through Custom Resources.
 *
 * @see docs/architecture/iac-custom-resource-design.md
 */

export { AgentCoreMemory, AgentCoreMemoryProps, IAgentCoreMemory } from './agentcore-memory';
export { BedrockKnowledgeBase, BedrockKnowledgeBaseProps, IBedrockKnowledgeBase, StorageType } from './bedrock-knowledge-base';
export { AgentCoreRuntimeEndpoint, AgentCoreRuntimeEndpointProps } from './agentcore-runtime-endpoint';
