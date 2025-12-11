/**
 * AgentCore Memory Custom Resource Handler
 *
 * Manages AgentCore Memory Store lifecycle through CloudFormation.
 * Implements idempotency, status waiting, and proper error handling.
 *
 * @see https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/
 */

import {
  BedrockAgentClient,
  // Note: AgentCore Memory commands - update imports when SDK is available
  // For now, we use the generic approach with send()
} from '@aws-sdk/client-bedrock-agent';

import type { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import {
  success,
  failure,
  waitForStatus,
  waitForDeletion,
  isResourceNotFoundException,
} from '../shared';
import type {
  MemoryResourceProperties,
  MemoryResponseData,
  MemoryResource,
  ListMemoriesResponse,
  CreateMemoryResponse,
  GetMemoryResponse,
} from './types';

// AgentCore Memory APIリージョン (Memory APIはGAリージョンで利用可能)
const AGENTCORE_REGION = process.env.AGENTCORE_REGION || 'ap-northeast-1';

/**
 * AgentCore Control Client
 *
 * Note: As of Dec 2025, the AgentCore Control API client may not be fully
 * available in AWS SDK for JavaScript v3. This implementation uses a
 * generic HTTP client approach that can be replaced when the SDK is updated.
 *
 * For production, consider using:
 * - @aws-sdk/client-bedrock-agentcore-control (when available)
 * - Or direct HTTP calls to the AgentCore API endpoint
 */
class AgentCoreMemoryClient {
  private endpoint: string;
  private region: string;

  constructor(region: string = AGENTCORE_REGION) {
    this.region = region;
    this.endpoint = `https://bedrock-agentcore-control.${region}.amazonaws.com`;
  }

  /**
   * List all memory stores
   */
  async listMemories(): Promise<ListMemoriesResponse> {
    // TODO: Replace with actual SDK call when available
    // Using boto3-equivalent: client.list_memories()
    const response = await this.makeRequest('GET', '/memories');
    return response as ListMemoriesResponse;
  }

  /**
   * Create a new memory store
   */
  async createMemory(params: {
    name: string;
    description?: string;
    eventExpiryDuration?: number;
  }): Promise<CreateMemoryResponse> {
    const response = await this.makeRequest('POST', '/memories', {
      name: params.name,
      description: params.description ?? `Managed by CDK Custom Resource`,
      eventExpiryDuration: params.eventExpiryDuration ?? 30,
    });
    return response as CreateMemoryResponse;
  }

  /**
   * Get memory store by ID
   */
  async getMemory(memoryId: string): Promise<GetMemoryResponse> {
    const response = await this.makeRequest('GET', `/memories/${memoryId}`);
    return response as GetMemoryResponse;
  }

  /**
   * Delete memory store
   */
  async deleteMemory(memoryId: string): Promise<void> {
    await this.makeRequest('DELETE', `/memories/${memoryId}`);
  }

  /**
   * Make HTTP request to AgentCore API
   *
   * Note: This is a simplified implementation. In production, use
   * AWS SDK's built-in signing and retry mechanisms.
   */
  private async makeRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const { SignatureV4 } = await import('@smithy/signature-v4');
    const { Sha256 } = await import('@aws-crypto/sha256-js');
    const { defaultProvider } = await import('@aws-sdk/credential-provider-node');
    const { HttpRequest } = await import('@smithy/protocol-http');

    const url = new URL(`${this.endpoint}${path}`);

    const request = new HttpRequest({
      method,
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        Host: url.hostname,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const signer = new SignatureV4({
      credentials: defaultProvider(),
      region: this.region,
      service: 'bedrock-agentcore-control',
      sha256: Sha256,
    });

    const signedRequest = await signer.sign(request);

    const response = await fetch(url.toString(), {
      method: signedRequest.method,
      headers: signedRequest.headers as HeadersInit,
      body: signedRequest.body as string | undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(`AgentCore API error: ${response.status} ${errorBody}`);
      (error as Error & { statusCode: number }).statusCode = response.status;
      throw error;
    }

    if (response.status === 204) {
      return {};
    }

    return response.json();
  }
}

// Client singleton
let client: AgentCoreMemoryClient | null = null;

function getClient(): AgentCoreMemoryClient {
  if (!client) {
    client = new AgentCoreMemoryClient(AGENTCORE_REGION);
  }
  return client;
}

/**
 * Lambda handler for CloudFormation Custom Resource
 */
export async function handler(
  event: CloudFormationCustomResourceEvent,
  _context: Context
): Promise<ReturnType<typeof success> | ReturnType<typeof failure>> {
  console.log('Event:', JSON.stringify(event, null, 2));

  const props = event.ResourceProperties as MemoryResourceProperties;
  const physicalResourceId = event.PhysicalResourceId;

  try {
    switch (event.RequestType) {
      case 'Create':
        return await handleCreate(props);

      case 'Update':
        return await handleUpdate(physicalResourceId, props, event);

      case 'Delete':
        return await handleDelete(physicalResourceId, props);

      default:
        return failure(
          physicalResourceId || props.MemoryName,
          `Unknown request type: ${event.RequestType}`
        );
    }
  } catch (error) {
    console.error('Handler error:', error);
    return failure(
      physicalResourceId || props.MemoryName,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Handle Create request
 */
async function handleCreate(
  props: MemoryResourceProperties
): Promise<ReturnType<typeof success>> {
  const memoryClient = getClient();

  // Idempotency check: find existing memory by name
  const existing = await findMemoryByName(memoryClient, props.MemoryName);
  if (existing) {
    console.log(`Memory already exists: ${existing.id}`);
    return success(existing.id, {
      MemoryId: existing.id,
      MemoryArn: existing.arn ?? '',
      Status: existing.status,
    });
  }

  // Create new memory
  console.log(`Creating memory: ${props.MemoryName}`);
  const createResponse = await memoryClient.createMemory({
    name: props.MemoryName,
    description: `Managed by CDK - ${props.Environment}`,
    eventExpiryDuration: props.EventExpiryDuration,
  });

  const memoryId = createResponse.memory.id;
  console.log(`Memory created: ${memoryId}`);

  // Wait for ACTIVE status
  const activeMemory = await waitForStatus<MemoryResource>(
    memoryId,
    'ACTIVE',
    async (id) => {
      const response = await memoryClient.getMemory(id);
      return response.memory;
    },
    { timeoutSeconds: 300, intervalSeconds: 10 }
  );

  console.log(`Memory is ACTIVE: ${memoryId}`);

  return success(memoryId, {
    MemoryId: memoryId,
    MemoryArn: activeMemory.arn ?? '',
    Status: activeMemory.status,
  });
}

/**
 * Handle Update request
 */
async function handleUpdate(
  physicalResourceId: string,
  props: MemoryResourceProperties,
  event: CloudFormationCustomResourceEvent
): Promise<ReturnType<typeof success>> {
  const memoryClient = getClient();

  // Check if name changed (requires replacement)
  const oldProps = (event as unknown as { OldResourceProperties?: MemoryResourceProperties })
    .OldResourceProperties;

  if (oldProps && oldProps.MemoryName !== props.MemoryName) {
    // Name change requires resource replacement
    // CloudFormation will handle deletion of old resource
    console.log(`Memory name changed, creating new resource`);
    return handleCreate(props);
  }

  // For non-name updates, return current state
  // Note: AgentCore Memory API may not support updates for all properties
  try {
    const response = await memoryClient.getMemory(physicalResourceId);
    return success(physicalResourceId, {
      MemoryId: response.memory.id,
      MemoryArn: response.memory.arn ?? '',
      Status: response.memory.status,
    });
  } catch (error) {
    if (isResourceNotFoundException(error)) {
      // Resource was deleted externally, recreate
      console.log(`Memory not found, recreating`);
      return handleCreate(props);
    }
    throw error;
  }
}

/**
 * Handle Delete request
 */
async function handleDelete(
  physicalResourceId: string,
  props: MemoryResourceProperties
): Promise<ReturnType<typeof success>> {
  if (!physicalResourceId || physicalResourceId === props.MemoryName) {
    // No physical resource ID means resource was never created
    console.log('No physical resource ID, skipping delete');
    return success(props.MemoryName, {
      MemoryId: '',
      MemoryArn: '',
      Status: 'DELETED',
    });
  }

  const memoryClient = getClient();

  try {
    console.log(`Deleting memory: ${physicalResourceId}`);
    await memoryClient.deleteMemory(physicalResourceId);

    // Wait for deletion to complete
    await waitForDeletion(
      physicalResourceId,
      async (id) => {
        const response = await memoryClient.getMemory(id);
        return response.memory;
      },
      { timeoutSeconds: 300, intervalSeconds: 5 }
    );

    console.log(`Memory deleted: ${physicalResourceId}`);
  } catch (error) {
    if (isResourceNotFoundException(error)) {
      console.log(`Memory already deleted: ${physicalResourceId}`);
    } else {
      throw error;
    }
  }

  return success(physicalResourceId, {
    MemoryId: physicalResourceId,
    MemoryArn: '',
    Status: 'DELETED',
  });
}

/**
 * Find memory by name (for idempotency check)
 */
async function findMemoryByName(
  memoryClient: AgentCoreMemoryClient,
  name: string
): Promise<MemoryResource | undefined> {
  try {
    const response = await memoryClient.listMemories();
    return response.memories.find((m) => m.name === name);
  } catch (error) {
    console.warn('Failed to list memories:', error);
    return undefined;
  }
}
