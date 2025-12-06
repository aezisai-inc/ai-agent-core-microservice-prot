/**
 * Message validation schema
 */

import { z } from "zod";
import { MessageRole } from "./model";

export const messageSchema = z.object({
  id: z.string(),
  role: z.nativeEnum(MessageRole),
  content: z.string().min(1, "Content is required"),
  timestamp: z.date(),
  tokensUsed: z.number().optional(),
  sources: z
    .array(
      z.object({
        chunkId: z.string(),
        documentId: z.string(),
        title: z.string(),
        content: z.string(),
        score: z.number().min(0).max(1),
        url: z.string().optional(),
      })
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export function validateMessage(data: unknown) {
  return messageSchema.safeParse(data);
}

