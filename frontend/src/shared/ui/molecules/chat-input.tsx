"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { Send, Paperclip } from "lucide-react";
import { Button } from "../atoms/button";
import { cn } from "@/shared/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({
  onSend,
  isLoading = false,
  placeholder = "メッセージを入力...",
  className,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSend(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 p-4 glass rounded-2xl",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-surface-400 hover:text-surface-200"
        disabled={isLoading}
      >
        <Paperclip className="h-5 w-5" />
      </Button>

      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={isLoading}
        rows={1}
        className={cn(
          "flex-1 resize-none bg-transparent text-surface-100",
          "placeholder:text-surface-500 focus:outline-none",
          "min-h-[40px] max-h-[200px] py-2"
        )}
      />

      <Button
        variant="primary"
        size="icon"
        onClick={handleSend}
        disabled={!message.trim() || isLoading}
        className="shrink-0"
      >
        <Send className="h-5 w-5" />
      </Button>
    </div>
  );
}

