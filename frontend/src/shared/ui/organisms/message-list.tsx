"use client";

import { useRef, useEffect } from "react";
import { MessageBubble, type MessageBubbleProps } from "../molecules/message-bubble";
import { cn } from "@/shared/lib/utils";

interface MessageListProps {
  messages: MessageBubbleProps[];
  isLoading?: boolean;
  className?: string;
}

export function MessageList({
  messages,
  isLoading = false,
  className,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto px-4 py-6 space-y-6",
        className
      )}
    >
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <span className="text-2xl">🤖</span>
          </div>
          <h3 className="text-xl font-display font-semibold text-surface-100 mb-2">
            Agentic RAG Assistant
          </h3>
          <p className="text-surface-400 max-w-md">
            何でも質問してください。ナレッジベースから関連情報を検索し、
            最適な回答を生成します。
          </p>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            <MessageBubble key={index} {...message} />
          ))}
          
          {isLoading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 shrink-0" />
              <div className="glass rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

