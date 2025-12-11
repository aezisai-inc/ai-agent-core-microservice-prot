/**
 * Type definitions for AgentCore Runtime Endpoint Custom Resource
 */

/**
 * Resource properties passed from CloudFormation
 */
export interface RuntimeEndpointResourceProperties {
  /** Agent Runtime ID */
  AgentRuntimeId: string;

  /** Endpoint name (alphanumeric + underscore only) */
  EndpointName: string;

  /** Environment name */
  Environment: string;

  /** ServiceToken (CDK internal) */
  ServiceToken: string;
}

/**
 * Response data returned to CloudFormation
 */
export interface RuntimeEndpointResponseData {
  /** Endpoint ID */
  EndpointId: string;

  /** Live Endpoint URL */
  EndpointUrl: string;

  /** Current status */
  Status: string;
}

/**
 * Runtime Endpoint resource from AgentCore API
 */
export interface RuntimeEndpointResource {
  agentRuntimeEndpointId: string;
  name: string;
  status: string;
  liveEndpointUrl?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}
