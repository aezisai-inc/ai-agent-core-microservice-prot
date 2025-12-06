/**
 * Message entity model
 */

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  sources?: MessageSource[];
  metadata?: Record<string, unknown>;
}

export interface MessageSource {
  chunkId: string;
  documentId: string;
  title: string;
  content: string;
  score: number;
  url?: string;
}

