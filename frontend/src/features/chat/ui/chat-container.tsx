"use client";

import { useCallback } from "react";
import { MessageList } from "@/shared/ui/organisms/message-list";
import { ChatInput } from "@/shared/ui/molecules/chat-input";
import { useSessionStore } from "@/entities/session";
import { MessageRole } from "@/entities/message";
import { useSendMessage } from "../api/send-message";
import { cn } from "@/shared/lib/utils";

interface ChatContainerProps {
  agentId: string;
  className?: string;
}

export function ChatContainer({ agentId, className }: ChatContainerProps) {
  const {
    currentSession,
    currentSessionId,
    createSession,
    addMessage,
    isLoading,
    setLoading,
  } = useSessionStore();

  const session = currentSession();
  const sendMessageMutation = useSendMessage();

  const handleSend = useCallback(
    async (content: string) => {
      let sessionId = currentSessionId;

      // Create new session if needed
      if (!sessionId) {
        sessionId = createSession(agentId, "user-1", "tenant-1");
      }

      // Add user message
      addMessage(sessionId, {
        role: MessageRole.USER,
        content,
      });

      setLoading(true);

      try {
        const response = await sendMessageMutation.mutateAsync({
          sessionId,
          agentId,
          question: content,
        });

        // Add assistant message
        addMessage(sessionId, {
          role: MessageRole.ASSISTANT,
          content: response.response,
          tokensUsed: response.tokensUsed,
          sources: response.sources.map((s) => ({
            chunkId: s.chunkId,
            documentId: s.documentId,
            title: s.source.split("/").pop() || "Document",
            content: s.content,
            score: s.score,
            url: s.source,
          })),
        });
      } catch (error) {
        // Add error message
        addMessage(sessionId, {
          role: MessageRole.ASSISTANT,
          content: "申し訳ありません。エラーが発生しました。もう一度お試しください。",
        });
      } finally {
        setLoading(false);
      }
    },
    [
      currentSessionId,
      createSession,
      addMessage,
      setLoading,
      sendMessageMutation,
      agentId,
    ]
  );

  // Convert messages to MessageBubbleProps format
  const messages =
    session?.messages.map((msg) => ({
      role: msg.role === MessageRole.USER ? ("user" as const) : ("assistant" as const),
      content: msg.content,
      timestamp: msg.timestamp,
      sources: msg.sources?.map((s) => ({
        title: s.title,
        url: s.url || "",
      })),
    })) || [];

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <MessageList messages={messages} isLoading={isLoading} className="flex-1" />
      <div className="p-4 border-t border-surface-800">
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}

