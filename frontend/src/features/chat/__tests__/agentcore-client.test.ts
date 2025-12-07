/**
 * AgentCore Client Tests
 * 
 * AWS SDK を使用した AgentCore クライアントのテスト
 */

import {
  AgentCoreClient,
  AgentCoreError,
  initAgentCoreClient,
  getAgentCoreClient,
} from '../api/agentcore-client';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  InvokeAgentCommand: jest.fn(),
}));

jest.mock('@aws-sdk/credential-providers', () => ({
  fromCognitoIdentityPool: jest.fn().mockReturnValue({}),
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => 'mock-id-token',
      },
    },
  }),
}));

describe('AgentCoreClient', () => {
  const defaultConfig = {
    region: 'ap-northeast-1',
    agentRuntimeId: 'test-runtime-id',
    agentEndpointId: 'test-endpoint-id',
    identityPoolId: 'test-identity-pool-id',
    userPoolId: 'test-user-pool-id',
  };

  let client: AgentCoreClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AgentCoreClient(defaultConfig);
  });

  describe('constructor', () => {
    it('should create client with config', () => {
      expect(client).toBeInstanceOf(AgentCoreClient);
    });
  });

  describe('stream', () => {
    it('should yield text chunks', async () => {
      const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime');
      
      // Mock streaming response
      const mockCompletion = (async function* () {
        yield {
          chunk: {
            bytes: new TextEncoder().encode('Hello '),
          },
        };
        yield {
          chunk: {
            bytes: new TextEncoder().encode('World'),
          },
        };
      })();

      (BedrockAgentRuntimeClient as jest.Mock).mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({
          completion: mockCompletion,
        }),
      }));

      // Create new client to use updated mock
      const testClient = new AgentCoreClient(defaultConfig);

      const chunks: string[] = [];
      for await (const chunk of testClient.stream({
        sessionId: 'test-session',
        userId: 'test-user',
        prompt: 'Hello',
      })) {
        if (chunk.type === 'text' && chunk.content) {
          chunks.push(chunk.content);
        }
      }

      expect(chunks.join('')).toBe('Hello World');
    });

    it('should yield error on failure', async () => {
      const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime');
      
      (BedrockAgentRuntimeClient as jest.Mock).mockImplementation(() => ({
        send: jest.fn().mockRejectedValue(new Error('API Error')),
      }));

      const testClient = new AgentCoreClient(defaultConfig);

      let errorChunk = null;
      for await (const chunk of testClient.stream({
        sessionId: 'test-session',
        userId: 'test-user',
        prompt: 'Hello',
      })) {
        if (chunk.type === 'error') {
          errorChunk = chunk;
        }
      }

      expect(errorChunk).not.toBeNull();
      expect(errorChunk?.error).toContain('API Error');
    });
  });

  describe('invoke', () => {
    it('should return aggregated response', async () => {
      const { BedrockAgentRuntimeClient } = await import('@aws-sdk/client-bedrock-agent-runtime');
      
      const mockCompletion = (async function* () {
        yield {
          chunk: {
            bytes: new TextEncoder().encode('Complete response'),
          },
        };
      })();

      (BedrockAgentRuntimeClient as jest.Mock).mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({
          completion: mockCompletion,
        }),
      }));

      const testClient = new AgentCoreClient(defaultConfig);

      const result = await testClient.invoke({
        sessionId: 'test-session',
        userId: 'test-user',
        prompt: 'Hello',
      });

      expect(result.response).toBe('Complete response');
    });
  });

  describe('reset', () => {
    it('should reset client state', () => {
      expect(() => client.reset()).not.toThrow();
    });
  });
});

describe('AgentCoreError', () => {
  it('should create error with status code', () => {
    const error = new AgentCoreError('Test error', 404);
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('AgentCoreError');
  });
});

describe('Singleton functions', () => {
  const config = {
    region: 'ap-northeast-1',
    agentRuntimeId: 'test-runtime-id',
    agentEndpointId: 'test-endpoint-id',
    identityPoolId: 'test-identity-pool-id',
    userPoolId: 'test-user-pool-id',
  };

  it('initAgentCoreClient should create and return client', () => {
    const client = initAgentCoreClient(config);
    expect(client).toBeInstanceOf(AgentCoreClient);
  });

  it('getAgentCoreClient should return initialized client', () => {
    initAgentCoreClient(config);
    const client = getAgentCoreClient();
    expect(client).toBeInstanceOf(AgentCoreClient);
  });
});
