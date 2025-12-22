/**
 * useChatStream Hook Tests
 */

import { renderHook, act } from '@testing-library/react';
import { useChatStream } from '../hooks/use-chat-stream';
import { AgentCoreClient } from '../api/agentcore-client';

// Mock AgentCoreClient
jest.mock('../api/agentcore-client', () => ({
  AgentCoreClient: jest.fn(),
}));

describe('useChatStream', () => {
  const defaultOptions = {
    config: {
      region: 'ap-northeast-1',
      agentRuntimeArn: 'arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/test-runtime',
      agentEndpointName: 'test-endpoint',
      identityPoolId: 'test-identity-pool-id',
      userPoolId: 'test-user-pool-id',
    },
    sessionId: 'sess-1',
    userId: 'user-1',
  };

  const createMockStream = (chunks: Array<{ type: string; content?: string; error?: string; sources?: unknown[]; latencyMs?: number; tokensUsed?: number }>) => {
    return jest.fn().mockImplementation(async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty messages', () => {
      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: createMockStream([]),
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const { result } = renderHook(() => useChatStream(defaultOptions));

      expect(result.current.messages).toEqual([]);
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.streamingText).toBe('');
      expect(result.current.error).toBeNull();
    });
  });

  describe('sendMessage', () => {
    it('should add user message to messages array', async () => {
      const mockStream = createMockStream([
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'from AI' },
        { type: 'end', latencyMs: 500, tokensUsed: 100 },
      ]);

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: mockStream,
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const { result } = renderHook(() => useChatStream(defaultOptions));

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('Hello from AI');
    });

    it('should call onMessage callback', async () => {
      const mockStream = createMockStream([
        { type: 'text', content: 'Response' },
        { type: 'end', latencyMs: 200, tokensUsed: 50 },
      ]);

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: mockStream,
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const onMessage = jest.fn();
      const { result } = renderHook(() =>
        useChatStream({ ...defaultOptions, onMessage })
      );

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: 'Response',
        })
      );
    });

    it('should handle errors', async () => {
      const mockStream = createMockStream([
        { type: 'error', error: 'API Error' },
      ]);

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: mockStream,
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useChatStream({ ...defaultOptions, onError })
      );

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      expect(result.current.error).not.toBeNull();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', async () => {
      const mockStream = createMockStream([
        { type: 'text', content: 'Response' },
        { type: 'end', latencyMs: 200, tokensUsed: 50 },
      ]);

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: mockStream,
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const { result } = renderHook(() => useChatStream(defaultOptions));

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.messages.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
    });
  });

  describe('clearError', () => {
    it('should clear error', async () => {
      const mockStream = createMockStream([
        { type: 'error', error: 'Test error' },
      ]);

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: mockStream,
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const { result } = renderHook(() => useChatStream(defaultOptions));

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('regenerate', () => {
    it('should remove last assistant message and resend', async () => {
      let callCount = 0;
      const createDynamicMockStream = () => {
        return jest.fn().mockImplementation(async function* () {
          callCount++;
          if (callCount === 1) {
            yield { type: 'text', content: 'First response' };
          } else {
            yield { type: 'text', content: 'Second response' };
          }
          yield { type: 'end', latencyMs: 200, tokensUsed: 50 };
        });
      };

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: createDynamicMockStream(),
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const { result } = renderHook(() => useChatStream(defaultOptions));

      // Send initial message
      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].content).toBe('First response');

      // Regenerate
      await act(async () => {
        await result.current.regenerate();
      });

      const assistantMessages = result.current.messages.filter(m => m.role === 'assistant');
      expect(assistantMessages.length).toBe(1);
      expect(assistantMessages[0].content).toBe('Second response');
    });
  });

  describe('sources handling', () => {
    it('should include RAG sources in assistant message', async () => {
      const mockSources = [
        { content: 'Source content', score: 0.95, source: 's3://bucket/doc.md' },
      ];

      const mockStream = createMockStream([
        { type: 'text', content: 'Response with sources' },
        { type: 'sources', sources: mockSources },
        { type: 'end', latencyMs: 200, tokensUsed: 50 },
      ]);

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        stream: mockStream,
        invoke: jest.fn(),
        reset: jest.fn(),
      }));

      const { result } = renderHook(() => useChatStream(defaultOptions));

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      expect(result.current.messages[1].sources).toEqual(mockSources);
    });
  });
});
