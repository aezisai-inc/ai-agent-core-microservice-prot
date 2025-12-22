"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import { Avatar } from "../atoms/avatar";
import { MermaidDiagram } from "../atoms/mermaid-diagram";
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
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-primary-300 prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-p:text-surface-200 prose-p:leading-relaxed prose-strong:text-white prose-strong:font-semibold prose-ul:text-surface-200 prose-ol:text-surface-200 prose-li:marker:text-primary-400 prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-primary-500 prose-blockquote:text-surface-300 prose-hr:border-surface-700">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const language = match?.[1] || "";
                    const codeContent = String(children).replace(/\n$/, "");
                    const inline = !match && !String(children).includes('\n');
                    
                    // Mermaid 図表の場合
                    if (language === "mermaid") {
                      return <MermaidDiagram chart={codeContent} className="my-3" />;
                    }
                    
                    return !inline ? (
                      <SyntaxHighlighter
                        style={oneDark as never}
                        language={language || "text"}
                        PreTag="div"
                        className="rounded-lg !bg-surface-900 !my-3"
                        customStyle={{
                          fontSize: "0.85em",
                          padding: "1em",
                        }}
                      >
                        {codeContent}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className="bg-surface-800/80 px-1.5 py-0.5 rounded text-primary-300 text-[0.9em] font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  ul({ children }) {
                    return <ul className="list-disc pl-4 space-y-1">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="list-decimal pl-4 space-y-1">{children}</ol>;
                  },
                  li({ children }) {
                    return <li className="text-surface-200">{children}</li>;
                  },
                  h1({ children }) {
                    return <h1 className="text-lg font-bold text-primary-300 mt-4 mb-2 first:mt-0">{children}</h1>;
                  },
                  h2({ children }) {
                    return <h2 className="text-base font-semibold text-primary-300 mt-3 mb-2">{children}</h2>;
                  },
                  h3({ children }) {
                    return <h3 className="text-sm font-semibold text-primary-400 mt-2 mb-1">{children}</h3>;
                  },
                  p({ children }) {
                    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-4 border-primary-500 pl-4 my-2 text-surface-300 italic">
                        {children}
                      </blockquote>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-3">
                        <table className="min-w-full border-collapse border border-surface-700">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="border border-surface-700 px-3 py-2 bg-surface-800 text-left font-semibold text-surface-200">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="border border-surface-700 px-3 py-2 text-surface-300">
                        {children}
                      </td>
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

