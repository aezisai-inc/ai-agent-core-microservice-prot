/**
 * Type definitions for AgentCore Memory Custom Resource
 */

/**
 * Resource properties passed from CloudFormation
 */
export interface MemoryResourceProperties {
  /** Memory Store name (alphanumeric + underscore only) */
  MemoryName: string;

  /** Event expiry duration in days */
  EventExpiryDuration: number;

  /** Environment name */
  Environment: string;

  /** ServiceToken (CDK internal) */
  ServiceToken: string;
}

/**
 * Response data returned to CloudFormation
 */
export interface MemoryResponseData {
  /** Memory Store ID */
  MemoryId: string;

  /** Memory Store ARN */
  MemoryArn: string;

  /** Current status */
  Status: string;
}

/**
 * Memory resource from AgentCore API
 *
 * Note: This interface is based on the AgentCore Control API response.
 * Update when official SDK types become available.
 */
export interface MemoryResource {
  id: string;
  name: string;
  arn?: string;
  status: string;
  description?: string;
  eventExpiryDuration?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * List memories response
 */
export interface ListMemoriesResponse {
  memories: MemoryResource[];
  nextToken?: string;
}

/**
 * Create memory response
 */
export interface CreateMemoryResponse {
  memory: MemoryResource;
}

/**
 * Get memory response
 */
export interface GetMemoryResponse {
  memory: MemoryResource;
}
