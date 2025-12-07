/**
 * Chat Feature (FSD)
 * 
 * Feature for handling chat interactions with the AI agent.
 * AgentCore Runtime への直接接続とストリーミングをサポート。
 */

// API
export { useSendMessage } from "./api/send-message";
export {
  AgentCoreClient,
  AgentCoreError,
  getAgentCoreClient,
  initAgentCoreClient,
  type AgentCoreConfig,
  type InvokeParams,
  type InvokeResponse,
  type StreamChunk,
} from "./api/agentcore-client";

// Hooks
export {
  useChatStream,
  type ChatMessage,
  type StreamMode,
  type UseChatStreamOptions,
  type UseChatStreamReturn,
} from "./hooks/use-chat-stream";
export {
  useAuth,
  type User,
  type AuthState,
  type UseAuthReturn,
} from "./hooks/use-auth";

// UI
export { ChatContainer } from "./ui/chat-container";

