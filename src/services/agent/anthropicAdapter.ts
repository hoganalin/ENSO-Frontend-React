import type { AgentAdapter, AgentCallContext } from "./adapter";
import type { AgentResponse, ChatMessage, ToolSchema } from "../../types/agent";
import {
  ANTHROPIC_API_URL,
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MAX_TOKENS,
  ANTHROPIC_MODEL_ID,
  parseAnthropicResponse,
  toAnthropicMessages,
} from "./anthropicProtocol";

// AnthropicAdapter — client-side direct 呼叫
// ⚠️ 會把 API key bundle 到 client，**僅限 local dev**。
// Production 應該用 ServerAnthropicAdapter（走 Next.js Route Handler）。
//
// 保留這個 adapter 的原因：
// 1. 開發時想快速 debug 不一定要跑 server
// 2. 作為教材 show「直接打 Anthropic」跟「走 proxy」的差別

export class AnthropicAdapter implements AgentAdapter {
  readonly name = `claude-haiku-4.5 (direct)`;

  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        "AnthropicAdapter requires an API key. Set NEXT_PUBLIC_ANTHROPIC_API_KEY in .env.local",
      );
    }
    this.apiKey = apiKey;
  }

  async sendMessage(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: ToolSchema[],
    _context?: AgentCallContext,
  ): Promise<AgentResponse> {
    const body = {
      model: ANTHROPIC_MODEL_ID,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      tools,
      messages: toAnthropicMessages(messages),
    };

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return parseAnthropicResponse(data);
  }
}
