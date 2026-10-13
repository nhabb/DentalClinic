import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { UsersService } from '../../shared/users/users.service';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { can, describeAccess, toolsFor } from './agent-access';
import { contentLogsEnabled, logText } from './agent-log';
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
  private readonly logger = new Logger(AgentService.name);
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
    const who = `user ${user.id} (${user.role})`;
    const question = messages.at(-1)?.content ?? '';
    this.logger.log(
      contentLogsEnabled()
        ? `Question from ${who}: ${logText(question)}`
        : `Question from ${who} (${question.length} chars)`,
    );

    const tools = toolsFor(user);
    const systemPrompt = buildSystemPrompt({
      user,
      displayName: await this.displayNameOf(user),
      today: new Date().toLocaleDateString('en-CA'),
      dbSchema: this.schema.text,
    });
    this.logContext(who, user, tools, systemPrompt);

    let conversation: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let round = 1;
    let response = await this.client.chat.completions.create({
      model: MODEL,
      tools,
      messages: conversation,
    });
    this.logRound(round, response);

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
      this.logRound(++round, response);
    }

    const answer =
      response.choices[0].message.content ?? 'No response generated.';
    this.logger.log(
      contentLogsEnabled()
        ? `Answer to ${who}: ${logText(answer)}`
        : `Answer to ${who} (${answer.length} chars)`,
    );
    return answer;
  }

  /**
   * What the model was given before it answered: the user's permissions, the
   * tools it may call and which prompt rules apply. With AGENT_LOG_PROMPT=true
   * the whole system prompt is printed too (it is long: it holds the schema).
   */
  private logContext(
    who: string,
    user: RequestUser,
    tools: OpenAI.ChatCompletionFunctionTool[],
    systemPrompt: string,
  ): void {
    const { granted, denied } = describeAccess(user);
    const keys = (lines: { key: string }[]) =>
      lines.length ? lines.map((l) => l.key).join(', ') : '(none)';
    this.logger.debug(`Access for ${who}: allowed [${keys(granted)}]`);
    this.logger.debug(`Access for ${who}: not allowed [${keys(denied)}]`);
    this.logger.debug(
      `Tools offered to the model (${tools.length}): ${tools.map((t) => t.function.name).join(', ')}`,
    );
    this.logger.debug(
      can(user, 'billing:read')
        ? 'Financial rules: full billing guidance (user has billing:read)'
        : 'Financial rules: hard stop, any money question must answer "needs billing:read" (user lacks it)',
    );
    if (process.env.AGENT_LOG_PROMPT === 'true') {
      this.logger.verbose(
        `System prompt (${systemPrompt.length} chars):
${systemPrompt}`,
      );
    }
  }

  /** The model's decision for one round: answer, or which tools it wants. */
  private logRound(round: number, response: OpenAI.ChatCompletion): void {
    const choice = response.choices[0];
    const usage = response.usage
      ? ` (tokens: ${response.usage.prompt_tokens} in, ${response.usage.completion_tokens} out)`
      : '';
    const showArgs = contentLogsEnabled();
    const calls = (choice.message.tool_calls ?? [])
      .map((c) =>
        c.type === 'function'
          ? `${c.function.name}(${showArgs ? logText(c.function.arguments) : '…'})`
          : c.type,
      )
      .join('; ');
    this.logger.debug(
      `Model round ${round}: finish_reason=${choice.finish_reason}${usage}${
        calls ? ` -> wants ${calls}` : ' -> answers directly, no tool'
      }`,
    );
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
