/**
 * Sidebar Widget (FSD)
 */

"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Bot } from "lucide-react";
import { ConversationList } from "@/shared/ui/organisms/conversation-list";
import { Button } from "@/shared/ui/atoms/button";
import { useSessionStore } from "@/entities/session";
import { cn } from "@/shared/lib/utils";

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { sessions, currentSessionId, setCurrentSession, createSession } =
    useSessionStore();

  const conversations = sessions.map((session) => ({
    id: session.id,
    title: session.title || "新しい会話",
    lastMessage: session.messages[session.messages.length - 1]?.content,
    updatedAt: new Date(session.updatedAt),
    messageCount: session.messages.length,
  }));

  const handleNewConversation = () => {
    createSession("agent-001", "user-1", "tenant-1");
  };

  return (
    <aside
      className={cn(
        "h-screen bg-surface-900 border-r border-surface-800 transition-all duration-300",
        isCollapsed ? "w-16" : "w-72"
      )}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-surface-800">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary-400" />
            <span className="font-display font-semibold text-surface-100">
              Sessions
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(isCollapsed && "mx-auto")}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <ConversationList
          conversations={conversations}
          activeId={currentSessionId || undefined}
          onSelect={setCurrentSession}
          onNew={handleNewConversation}
        />
      )}
    </aside>
  );
}

