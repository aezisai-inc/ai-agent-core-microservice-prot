/**
 * CopilotKit Runtime API Route
 *
 * CopilotKit からのリクエストを受け取り、
 * AgentCore Runtime の AG-UI エンドポイントに転送する。
 *
 * Note:
 * - AGENTCORE_AG_UI_ENDPOINT が未設定の場合はモック応答を返す
 * - Authorization ヘッダーは AgentCore に転送される
 */

import { NextRequest, NextResponse } from "next/server";

// AgentCore Runtime の AG-UI エンドポイント URL
const AGENTCORE_AG_UI_ENDPOINT = process.env.AGENTCORE_AG_UI_ENDPOINT;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Authorization ヘッダーを取得
    const authHeader = req.headers.get("Authorization");

    // リクエストボディを取得
    const body = await req.json();

    console.log("[CopilotKit API] Request received", {
      hasAuth: !!authHeader,
      messageCount: body.messages?.length || 0,
    });

    // AG-UI エンドポイントが設定されていない場合はモック応答
    if (!AGENTCORE_AG_UI_ENDPOINT) {
      console.warn(
        "[CopilotKit API] AGENTCORE_AG_UI_ENDPOINT not configured, using mock response"
      );
      return createMockResponse(body);
    }

    // AgentCore Runtime の AG-UI エンドポイントに転送
    const response = await fetch(AGENTCORE_AG_UI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("[CopilotKit API] AgentCore error", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`AgentCore responded with ${response.status}`);
    }

    // SSE ストリームを転送
    const stream = response.body;
    if (!stream) {
      throw new Error("No response body from AgentCore");
    }

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[CopilotKit API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * AG-UI Event Types
 */
interface AgUiEvent {
  type: string;
  threadId?: string;
  runId?: string;
  messageId?: string;
  role?: string;
  delta?: string;
  error?: string;
}

/**
 * モック応答（開発・テスト用）
 *
 * AG-UI Protocol に準拠した SSE ストリームを返す
 */
function createMockResponse(body: {
  messages?: Array<{ role: string; content: string | Array<{ text: string }> }>;
}) {
  const messages = body.messages || [];
  const lastUserMessage = messages.findLast((m) => m.role === "user");

  // Extract user content
  let userContent = "Hello";
  if (lastUserMessage) {
    if (typeof lastUserMessage.content === "string") {
      userContent = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      userContent = lastUserMessage.content
        .map((item) => (typeof item === "object" ? item.text : String(item)))
        .join(" ");
    }
  }

  const threadId = `mock-thread-${Date.now()}`;
  const messageId = `mock-msg-${Date.now()}`;

  // AG-UI Protocol events
  const events: AgUiEvent[] = [
    { type: "RUN_STARTED", threadId },
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: `**CopilotKit Mock Response**\n\n`,
    },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: `あなたのメッセージを受け取りました:\n\n> ${userContent.slice(0, 100)}${userContent.length > 100 ? "..." : ""}\n\n`,
    },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: `これは **AG-UI Protocol** を使用した CopilotKit のモック応答です。\n\n`,
    },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: `\`AGENTCORE_AG_UI_ENDPOINT\` 環境変数を設定すると、実際の AgentCore Runtime に接続されます。\n\n`,
    },
    {
      type: "TEXT_MESSAGE_CONTENT",
      messageId,
      delta: `### 現在の構成\n- Route: \`/copilot\`\n- API: \`/api/copilot\`\n- Protocol: AG-UI\n`,
    },
    { type: "TEXT_MESSAGE_END", messageId },
    { type: "RUN_FINISHED", threadId },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        // 少し遅延を入れてストリーミング感を出す
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
