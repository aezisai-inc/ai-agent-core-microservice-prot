/**
 * Session entity model
 */

import type { Message } from "../message";

export enum SessionStatus {
  ACTIVE = "active",
  ENDED = "ended",
  EXPIRED = "expired",
}

export interface Session {
  id: string;
  agentId: string;
  userId: string;
  tenantId: string;
  status: SessionStatus;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  totalTokens: number;
  title?: string;
}

