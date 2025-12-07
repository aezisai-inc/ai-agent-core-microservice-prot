"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import { Avatar } from "../atoms/avatar";
import { SourceCard } from "./source-card";
import { cn } from "@/shared/lib/utils";

export interface RAGSourceInfo {
  content: string;
  score: number;
  source: string;
}

export interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  isStreaming?: boolean;
  sources?: RAGSourceInfo[];
}

export function MessageBubble({
  role,
  content,
  timestamp,
  isStreaming = false,
  sources,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [showSources, setShowSources] = useState(false);
  const hasValidSources = sources && sources.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar
        size="sm"
        fallback={isUser ? "U" : "AI"}
        className={cn(
          "shrink-0",
          isUser
            ? "bg-gradient-to-br from-accent-500 to-accent-700"
            : "bg-gradient-to-br from-primary-500 to-primary-700"
        )}
      />

      <div
        className={cn(
          "flex flex-col gap-1 max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-accent-600 text-white rounded-br-sm"
              : "glass rounded-bl-sm"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const inline = !match;
                    return !inline ? (
                      <SyntaxHighlighter
                        style={oneDark as never}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-lg !bg-surface-900"
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className="bg-surface-800 px-1.5 py-0.5 rounded text-primary-300"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-primary-400 animate-pulse" />
              )}
            </div>
          )}
        </div>

        {/* RAG Sources Section */}
        {hasValidSources && (
          <div className="w-full mt-2">
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-2 text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>参照ソース ({sources.length}件)</span>
              {showSources ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            
            <AnimatePresence>
              {showSources && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-2 mt-2">
                    {sources.map((source, index) => (
                      <SourceCard
                        key={index}
                        title={source.source.split('/').pop() || `Source ${index + 1}`}
                        content={source.content}
                        score={source.score}
                        source={source.source}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {timestamp && (
          <span className="text-xs text-surface-500">
            {timestamp.toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </motion.div>
  );
}

