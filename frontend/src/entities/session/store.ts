/**
 * Session state store using Zustand
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "./model";
import type { Message } from "../message";
import { SessionStatus } from "./model";
import { MessageRole } from "../message";

interface SessionState {
  // State
  sessions: Session[];
  currentSessionId: string | null;
  isLoading: boolean;
  error: string | null;

  // Computed
  currentSession: () => Session | null;

  // Actions
  createSession: (agentId: string, userId: string, tenantId: string) => string;
  setCurrentSession: (sessionId: string | null) => void;
  addMessage: (sessionId: string, message: Omit<Message, "id" | "timestamp">) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  endSession: (sessionId: string) => void;
  clearSessions: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      currentSessionId: null,
      isLoading: false,
      error: null,

      // Computed
      currentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find((s) => s.id === currentSessionId) || null;
      },

      // Actions
      createSession: (agentId, userId, tenantId) => {
        const newSession: Session = {
          id: `session-${Date.now()}`,
          agentId,
          userId,
          tenantId,
          status: SessionStatus.ACTIVE,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          totalTokens: 0,
        };

        set((state) => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: newSession.id,
        }));

        return newSession.id;
      },

      setCurrentSession: (sessionId) => {
        set({ currentSessionId: sessionId });
      },

      addMessage: (sessionId, message) => {
        const newMessage: Message = {
          ...message,
          id: `msg-${Date.now()}`,
          timestamp: new Date(),
        };

        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: [...session.messages, newMessage],
                  updatedAt: new Date(),
                  totalTokens: session.totalTokens + (message.tokensUsed || 0),
                  title:
                    session.title ||
                    (message.role === MessageRole.USER
                      ? message.content.slice(0, 50)
                      : undefined),
                }
              : session
          ),
        }));
      },

      updateSession: (sessionId, updates) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, ...updates, updatedAt: new Date() }
              : session
          ),
        }));
      },

      endSession: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, status: SessionStatus.ENDED, updatedAt: new Date() }
              : session
          ),
        }));
      },

      clearSessions: () => {
        set({ sessions: [], currentSessionId: null });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error });
      },
    }),
    {
      name: "session-storage",
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);

