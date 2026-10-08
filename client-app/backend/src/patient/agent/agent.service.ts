import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { UsersService } from '../../shared/users/users.service';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { toolsFor } from './agent-access';
import { buildSystemPrompt } from './agent-prompt';
import { SchemaSummary } from './schema-summary';
import { ToolArgs } from './tool-args';
import { ToolRunner } from './tools/tool-runner';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MODEL = 'gpt-4o-mini';

/**
 * The clinic AI assistant: an OpenAI function-calling loop.
 *
 * This class only talks to the model. What the user may do is decided in
 * agent-access.ts (which tools they see) and enforced by ToolRunner (every
 * call is checked again before it runs).
 */
@Injectable()
export class AgentService {
  private openai: OpenAI | null = null;

  constructor(
    private readonly users: UsersService,
    private readonly schema: SchemaSummary,
    private readonly tools: ToolRunner,
  ) {}

  /** Created on first use so the API key is only needed when someone chats. */
  private get client(): OpenAI {
    this.openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this.openai;
  }

  async chat(messages: ChatMessage[], user: RequestUser): Promise<string> {
    const tools = toolsFor(user);
    const systemPrompt = buildSystemPrompt({
      user,
      displayName: await this.displayNameOf(user),
      today: new Date().toLocaleDateString('en-CA'),
      dbSchema: this.schema.text,
    });

    let conversation: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let response = await this.client.chat.completions.create({
      model: MODEL,
      tools,
      messages: conversation,
    });

    // The model asks for tools until it has what it needs to answer.
    while (response.choices[0].finish_reason === 'tool_calls') {
      const assistantMessage = response.choices[0].message;
      const toolResults = await Promise.all(
        (assistantMessage.tool_calls ?? []).map(async (call) => ({
          role: 'tool' as const,
          tool_call_id: call.id,
          content:
            call.type === 'function'
              ? await this.tools.run(
                  user,
                  call.function.name,
                  ToolArgs.parse(call.function.arguments),
                )
              : JSON.stringify({ error: 'Unsupported tool call type' }),
        })),
      );
      conversation = [...conversation, assistantMessage, ...toolResults];

      response = await this.client.chat.completions.create({
        model: MODEL,
        tools,
        messages: conversation,
      });
    }

    return response.choices[0].message.content ?? 'No response generated.';
  }

  private async displayNameOf(user: RequestUser): Promise<string | null> {
    try {
      const row = await this.users.findById(BigInt(user.id));
      return row?.first_name
        ? `${row.first_name} ${row.last_name ?? ''}`.trim()
        : null;
    } catch {
      return null;
    }
  }
}
