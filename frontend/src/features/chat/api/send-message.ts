/**
 * Send message API hook
 */

import { useMutation } from "@tanstack/react-query";

interface SendMessageParams {
  sessionId: string;
  agentId: string;
  question: string;
}

interface SendMessageResponse {
  response: string;
  tokensUsed: number;
  latencyMs: number;
  sources: Array<{
    content: string;
    score: number;
    source: string;
    chunkId: string;
    documentId: string;
  }>;
}

async function sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
  const response = await fetch("/api/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      agent_id: params.agentId,
      question: params.question,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to send message");
  }

  return response.json();
}

export function useSendMessage() {
  return useMutation({
    mutationFn: sendMessage,
  });
}

