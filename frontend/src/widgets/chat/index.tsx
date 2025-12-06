/**
 * Chat Widget (FSD)
 * 
 * Compositional widget combining features and entities
 * for the chat interface.
 */

"use client";

import { ChatContainer } from "@/features/chat";

const DEFAULT_AGENT_ID = "agent-001";

export function ChatWidget() {
  return (
    <div className="h-full">
      <ChatContainer agentId={DEFAULT_AGENT_ID} />
    </div>
  );
}

