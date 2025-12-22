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

// Polyfills for Jest (Node.js environment)
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// ReadableStream polyfill for Node.js
const { ReadableStream: NodeReadableStream } = require('stream/web');
global.ReadableStream = NodeReadableStream;

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-bedrock-agentcore', () => ({
  BedrockAgentCoreClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  InvokeAgentRuntimeCommand: jest.fn(),
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

// Helper to create mock SdkStream with transformToWebStream
function createMockSdkStream(chunks: string[]) {
  return {
    transformToWebStream: () => {
      let index = 0;
      return new ReadableStream({
        pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(new TextEncoder().encode(chunks[index]));
            index++;
          } else {
            controller.close();
          }
        },
      });
    },
    transformToString: async () => chunks.join(''),
    transformToByteArray: async () => new TextEncoder().encode(chunks.join('')),
  };
}

describe('AgentCoreClient', () => {
  const defaultConfig = {
    region: 'ap-northeast-1',
    agentRuntimeArn: 'arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/test-runtime',
    agentEndpointName: 'test-endpoint',
    identityPoolId: 'test-identity-pool-id',
    userPoolId: 'test-user-pool-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
  });

  describe('constructor', () => {
    it('should create client with config', () => {
      const client = new AgentCoreClient(defaultConfig);
      expect(client).toBeInstanceOf(AgentCoreClient);
    });
  });

  describe('stream', () => {
    it('should yield text chunks from response stream', async () => {
      const mockResponse = createMockSdkStream(['Hello ', 'World']);

      mockSend.mockResolvedValue({
        response: mockResponse,
      });

      const client = new AgentCoreClient(defaultConfig);
      const chunks: string[] = [];
      
      for await (const chunk of client.stream({
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

    it('should yield error on API failure', async () => {
      mockSend.mockRejectedValue(new Error('API Error'));

      const client = new AgentCoreClient(defaultConfig);
      let errorChunk = null;
      
      for await (const chunk of client.stream({
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

    it('should yield end chunk when stream completes', async () => {
      const mockResponse = createMockSdkStream(['Done']);

      mockSend.mockResolvedValue({
        response: mockResponse,
      });

      const client = new AgentCoreClient(defaultConfig);
      let endChunk = null;
      
      for await (const chunk of client.stream({
        sessionId: 'test-session',
        userId: 'test-user',
        prompt: 'Hello',
      })) {
        if (chunk.type === 'end') {
          endChunk = chunk;
        }
      }

      expect(endChunk).not.toBeNull();
      expect(endChunk?.latencyMs).toBeDefined();
    });

    it('should handle JSON formatted chunks', async () => {
      const mockResponse = createMockSdkStream([
        '{"type":"text","content":"Hello"}\n',
        '{"type":"text","content":" World"}\n',
      ]);

      mockSend.mockResolvedValue({
        response: mockResponse,
      });

      const client = new AgentCoreClient(defaultConfig);
      const chunks: string[] = [];
      
      for await (const chunk of client.stream({
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
  });

  describe('invoke', () => {
    it('should return aggregated response', async () => {
      const mockResponse = createMockSdkStream(['Complete response']);

      mockSend.mockResolvedValue({
        response: mockResponse,
      });

      const client = new AgentCoreClient(defaultConfig);
      const result = await client.invoke({
        sessionId: 'test-session',
        userId: 'test-user',
        prompt: 'Hello',
      });

      expect(result.response).toBe('Complete response');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    it('should reset client state without error', () => {
      const client = new AgentCoreClient(defaultConfig);
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
    agentRuntimeArn: 'arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/test-runtime',
    agentEndpointName: 'test-endpoint',
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
