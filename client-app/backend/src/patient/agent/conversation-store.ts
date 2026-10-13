import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { ChatMessage } from './agent.service';

/** Turns handed to the model per request; older ones stay stored but are not sent. */
export const CONTEXT_TURNS = 40;

/** Turns kept per conversation; beyond this the oldest are dropped. */
export const STORED_TURNS = 200;

/**
 * Each signed-in person's conversation with the assistant, kept on the server.
 *
 * The browser only ever sends the new message, so nothing can carry over from
 * a previous person on the same page and no client can invent assistant turns.
 * One row per user (unique user_id); "new chat" deletes it. Rows are tenant
 * data under row-level security and the assistant's own SQL role has no grant
 * on the table, so a conversation is never visible to anyone else, including
 * through query_database.
 */
@Injectable()
export class ConversationStore {
  constructor(private readonly prisma: PrismaService) {}

  /** The stored turns of this user, oldest first, capped to what the model should see. */
  async history(userId: bigint): Promise<ChatMessage[]> {
    const row = await this.prisma.agent_conversations.findUnique({
      where: { user_id: userId },
      select: { messages: true },
    });
    return asTurns(row?.messages).slice(-CONTEXT_TURNS);
  }

  /** Add turns to this user's conversation, creating it on first use. */
  async append(userId: bigint, turns: ChatMessage[]): Promise<void> {
    const row = await this.prisma.agent_conversations.findUnique({
      where: { user_id: userId },
      select: { messages: true },
    });
    const messages = [...asTurns(row?.messages), ...turns]
      .slice(-STORED_TURNS)
      .map(asJson);
    await this.prisma.agent_conversations.upsert({
      where: { user_id: userId },
      create: { user_id: userId, messages },
      update: { messages, updated_at: new Date() },
    });
  }

  /** Start over: forget everything this user said and was told. */
  async clear(userId: bigint): Promise<void> {
    await this.prisma.agent_conversations.deleteMany({
      where: { user_id: userId },
    });
  }
}

/** The plain JSON shape Prisma stores (a typed object has no index signature). */
const asJson = (m: ChatMessage): Record<string, string> => ({
  role: m.role,
  content: m.content,
});

/** Only well-formed turns come back from storage; anything else is dropped. */
function asTurns(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is ChatMessage =>
      !!m &&
      typeof m === 'object' &&
      ((m as ChatMessage).role === 'user' ||
        (m as ChatMessage).role === 'assistant') &&
      typeof (m as ChatMessage).content === 'string',
  );
}
