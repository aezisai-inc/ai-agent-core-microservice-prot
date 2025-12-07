/**
 * useChatStream Hook Tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatStream } from '../hooks/use-chat-stream';
import { AgentCoreClient } from '../api/agentcore-client';

// Mock AgentCoreClient
jest.mock('../api/agentcore-client', () => ({
  AgentCoreClient: jest.fn().mockImplementation(() => ({
    setAuthToken: jest.fn(),
    invoke: jest.fn(),
    stream: jest.fn(),
    connectWebSocket: jest.fn(),
    cancelStream: jest.fn(),
  })),
}));

describe('useChatStream', () => {
  const defaultOptions = {
    config: {
      endpoint: 'https://agentcore.example.com',
      authToken: 'test-token',
    },
    sessionId: 'sess-1',
    userId: 'user-1',
    streamMode: 'none' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty messages', () => {
      const { result } = renderHook(() => useChatStream(defaultOptions));

      expect(result.current.messages).toEqual([]);
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.streamingText).toBe('');
      expect(result.current.error).toBeNull();
    });
  });

  describe('sendMessage', () => {
    it('should add user message to messages array', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        response: 'Hello from AI',
        tokensUsed: 100,
        latencyMs: 500,
        toolsUsed: [],
        sources: [],
      });

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: mockInvoke,
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
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
      const mockInvoke = jest.fn().mockResolvedValue({
        response: 'Response',
        tokensUsed: 50,
        latencyMs: 200,
        toolsUsed: [],
        sources: [],
      });

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: mockInvoke,
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
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
      const mockError = new Error('API Error');
      const mockInvoke = jest.fn().mockRejectedValue(mockError);

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: mockInvoke,
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
      }));

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useChatStream({ ...defaultOptions, onError })
      );

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      expect(result.current.error).toBe(mockError);
      expect(onError).toHaveBeenCalledWith(mockError);
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        response: 'Response',
        tokensUsed: 50,
        latencyMs: 200,
        toolsUsed: [],
        sources: [],
      });

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: mockInvoke,
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
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
      const mockInvoke = jest.fn().mockRejectedValue(new Error('Error'));

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: mockInvoke,
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
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

  describe('cancelStream', () => {
    it('should call client cancelStream', () => {
      const mockCancelStream = jest.fn();

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: jest.fn(),
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: mockCancelStream,
      }));

      const { result } = renderHook(() => useChatStream(defaultOptions));

      act(() => {
        result.current.cancelStream();
      });

      expect(mockCancelStream).toHaveBeenCalled();
    });
  });

  describe('regenerate', () => {
    it('should remove last assistant message and resend', async () => {
      const mockInvoke = jest
        .fn()
        .mockResolvedValueOnce({
          response: 'First response',
          tokensUsed: 50,
          latencyMs: 200,
          toolsUsed: [],
          sources: [],
        })
        .mockResolvedValueOnce({
          response: 'Second response',
          tokensUsed: 60,
          latencyMs: 250,
          toolsUsed: [],
          sources: [],
        });

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: mockInvoke,
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
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

      // Should have original user message, new user message (from regenerate), and new assistant response
      // Note: regenerate sends a new message, so there will be 3 messages (original user + new user + new assistant)
      // or the last assistant is replaced. The current implementation adds a new user message.
      const assistantMessages = result.current.messages.filter(m => m.role === 'assistant');
      expect(assistantMessages.length).toBe(1);
      expect(assistantMessages[0].content).toBe('Second response');
    });
  });

  describe('streaming modes', () => {
    it('should support none mode (non-streaming)', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        response: 'Non-streamed response',
        tokensUsed: 100,
        latencyMs: 500,
        toolsUsed: [],
        sources: [],
      });

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: jest.fn(),
        invoke: mockInvoke,
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
      }));

      const { result } = renderHook(() =>
        useChatStream({ ...defaultOptions, streamMode: 'none' })
      );

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      expect(mockInvoke).toHaveBeenCalled();
      expect(result.current.messages[1].content).toBe('Non-streamed response');
    });
  });

  describe('auth token update', () => {
    it('should update auth token when config changes', () => {
      const mockSetAuthToken = jest.fn();

      (AgentCoreClient as jest.Mock).mockImplementation(() => ({
        setAuthToken: mockSetAuthToken,
        invoke: jest.fn(),
        stream: jest.fn(),
        connectWebSocket: jest.fn(),
        cancelStream: jest.fn(),
      }));

      const { rerender } = renderHook(
        ({ authToken }) =>
          useChatStream({
            ...defaultOptions,
            config: { ...defaultOptions.config, authToken },
          }),
        { initialProps: { authToken: 'initial-token' } }
      );

      rerender({ authToken: 'new-token' });

      expect(mockSetAuthToken).toHaveBeenCalledWith('new-token');
    });
  });
});
