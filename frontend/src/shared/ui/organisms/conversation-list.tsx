"use client";

import { MessageSquare, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "../atoms/button";
import { cn } from "@/shared/lib/utils";

interface Conversation {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: Date;
  messageCount: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  className?: string;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  className,
}: ConversationListProps) {
  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="p-4">
        <Button
          variant="primary"
          className="w-full"
          onClick={onNew}
        >
          <Plus className="h-4 w-4" />
          新しい会話
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="space-y-1">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left",
                activeId === conversation.id
                  ? "bg-primary-900/30 border border-primary-700/50"
                  : "hover:bg-surface-800"
              )}
            >
              <MessageSquare
                className={cn(
                  "h-5 w-5 shrink-0 mt-0.5",
                  activeId === conversation.id
                    ? "text-primary-400"
                    : "text-surface-500"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-surface-100 truncate">
                    {conversation.title}
                  </h4>
                  <button className="p-1 hover:bg-surface-700 rounded opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-4 w-4 text-surface-400" />
                  </button>
                </div>
                {conversation.lastMessage && (
                  <p className="text-xs text-surface-500 truncate mt-0.5">
                    {conversation.lastMessage}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-surface-600">
                  <span>{conversation.messageCount} messages</span>
                  <span>•</span>
                  <span>
                    {conversation.updatedAt.toLocaleDateString("ja-JP")}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

