/**
 * AgentCore Runtime Endpoint Custom Resource Handler
 *
 * Manages AgentCore Runtime Endpoint lifecycle through CloudFormation.
 *
 * @see https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/
 */

import type { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import {
  success,
  failure,
  waitForStatus,
  waitForDeletion,
  isResourceNotFoundException,
} from '../shared';
import type {
  RuntimeEndpointResourceProperties,
  RuntimeEndpointResponseData,
  RuntimeEndpointResource,
} from './types';

const AGENTCORE_REGION = process.env.AGENTCORE_REGION || 'ap-northeast-1';

/**
 * AgentCore Control Client for Runtime Endpoint operations
 *
 * Note: Similar to Memory client, using HTTP approach until SDK is available.
 */
class AgentCoreRuntimeClient {
  private endpoint: string;
  private region: string;

  constructor(region: string = AGENTCORE_REGION) {
    this.region = region;
    this.endpoint = `https://bedrock-agentcore-control.${region}.amazonaws.com`;
  }

  async listEndpoints(agentRuntimeId: string): Promise<{ agentRuntimeEndpoints: RuntimeEndpointResource[] }> {
    const response = await this.makeRequest(
      'GET',
      `/agent-runtimes/${agentRuntimeId}/endpoints`
    );
    return response as { agentRuntimeEndpoints: RuntimeEndpointResource[] };
  }

  async createEndpoint(
    agentRuntimeId: string,
    params: { name: string; description?: string }
  ): Promise<{ agentRuntimeEndpointId: string }> {
    const response = await this.makeRequest(
      'POST',
      `/agent-runtimes/${agentRuntimeId}/endpoints`,
      params
    );
    return response as { agentRuntimeEndpointId: string };
  }

  async getEndpoint(
    agentRuntimeId: string,
    endpointId: string
  ): Promise<{ agentRuntimeEndpoint: RuntimeEndpointResource }> {
    const response = await this.makeRequest(
      'GET',
      `/agent-runtimes/${agentRuntimeId}/endpoints/${endpointId}`
    );
    return response as { agentRuntimeEndpoint: RuntimeEndpointResource };
  }

  async deleteEndpoint(agentRuntimeId: string, endpointId: string): Promise<void> {
    await this.makeRequest(
      'DELETE',
      `/agent-runtimes/${agentRuntimeId}/endpoints/${endpointId}`
    );
  }

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

let client: AgentCoreRuntimeClient | null = null;

function getClient(): AgentCoreRuntimeClient {
  if (!client) {
    client = new AgentCoreRuntimeClient(AGENTCORE_REGION);
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

  const props = event.ResourceProperties as RuntimeEndpointResourceProperties;
  const physicalResourceId = event.PhysicalResourceId;

  try {
    switch (event.RequestType) {
      case 'Create':
        return await handleCreate(props);

      case 'Update':
        return await handleUpdate(physicalResourceId, props);

      case 'Delete':
        return await handleDelete(physicalResourceId, props);

      default:
        return failure(
          physicalResourceId || props.EndpointName,
          `Unknown request type: ${event.RequestType}`
        );
    }
  } catch (error) {
    console.error('Handler error:', error);
    return failure(
      physicalResourceId || props.EndpointName,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Handle Create request
 */
async function handleCreate(
  props: RuntimeEndpointResourceProperties
): Promise<ReturnType<typeof success>> {
  const runtimeClient = getClient();

  // Idempotency check
  const existing = await findEndpointByName(
    runtimeClient,
    props.AgentRuntimeId,
    props.EndpointName
  );
  if (existing) {
    console.log(`Endpoint already exists: ${existing.agentRuntimeEndpointId}`);
    return success(existing.agentRuntimeEndpointId, {
      EndpointId: existing.agentRuntimeEndpointId,
      EndpointUrl: existing.liveEndpointUrl ?? '',
      Status: existing.status,
    });
  }

  // Create endpoint
  console.log(`Creating endpoint: ${props.EndpointName}`);
  const createResponse = await runtimeClient.createEndpoint(props.AgentRuntimeId, {
    name: props.EndpointName,
    description: `Managed by CDK - ${props.Environment}`,
  });

  const endpointId = createResponse.agentRuntimeEndpointId;
  console.log(`Endpoint created: ${endpointId}`);

  // Wait for ACTIVE status
  const activeEndpoint = await waitForStatus<RuntimeEndpointResource>(
    endpointId,
    'ACTIVE',
    async (id) => {
      const response = await runtimeClient.getEndpoint(props.AgentRuntimeId, id);
      return response.agentRuntimeEndpoint;
    },
    { timeoutSeconds: 300, intervalSeconds: 10 }
  );

  console.log(`Endpoint is ACTIVE: ${endpointId}`);

  return success(endpointId, {
    EndpointId: endpointId,
    EndpointUrl: activeEndpoint.liveEndpointUrl ?? '',
    Status: activeEndpoint.status,
  });
}

/**
 * Handle Update request
 */
async function handleUpdate(
  physicalResourceId: string,
  props: RuntimeEndpointResourceProperties
): Promise<ReturnType<typeof success>> {
  const runtimeClient = getClient();

  try {
    const response = await runtimeClient.getEndpoint(
      props.AgentRuntimeId,
      physicalResourceId
    );
    const endpoint = response.agentRuntimeEndpoint;

    return success(physicalResourceId, {
      EndpointId: endpoint.agentRuntimeEndpointId,
      EndpointUrl: endpoint.liveEndpointUrl ?? '',
      Status: endpoint.status,
    });
  } catch (error) {
    if (isResourceNotFoundException(error)) {
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
  props: RuntimeEndpointResourceProperties
): Promise<ReturnType<typeof success>> {
  if (!physicalResourceId || physicalResourceId === props.EndpointName) {
    console.log('No physical resource ID, skipping delete');
    return success(props.EndpointName, {
      EndpointId: '',
      EndpointUrl: '',
      Status: 'DELETED',
    });
  }

  const runtimeClient = getClient();

  try {
    console.log(`Deleting endpoint: ${physicalResourceId}`);
    await runtimeClient.deleteEndpoint(props.AgentRuntimeId, physicalResourceId);

    // Wait for deletion
    await waitForDeletion(
      physicalResourceId,
      async (id) => {
        const response = await runtimeClient.getEndpoint(props.AgentRuntimeId, id);
        return response.agentRuntimeEndpoint;
      },
      { timeoutSeconds: 300, intervalSeconds: 5 }
    );

    console.log(`Endpoint deleted: ${physicalResourceId}`);
  } catch (error) {
    if (!isResourceNotFoundException(error)) {
      throw error;
    }
    console.log(`Endpoint already deleted: ${physicalResourceId}`);
  }

  return success(physicalResourceId, {
    EndpointId: physicalResourceId,
    EndpointUrl: '',
    Status: 'DELETED',
  });
}

/**
 * Find endpoint by name
 */
async function findEndpointByName(
  runtimeClient: AgentCoreRuntimeClient,
  agentRuntimeId: string,
  name: string
): Promise<RuntimeEndpointResource | undefined> {
  try {
    const response = await runtimeClient.listEndpoints(agentRuntimeId);
    return response.agentRuntimeEndpoints.find((e) => e.name === name);
  } catch (error) {
    console.warn('Failed to list endpoints:', error);
    return undefined;
  }
}
