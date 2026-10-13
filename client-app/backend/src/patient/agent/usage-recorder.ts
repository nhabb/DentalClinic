import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** What one answered question cost, summed over every model round. */
export interface UsageRecord {
  userId: bigint;
  model: string;
  promptTokens: number;
  completionTokens: number;
  rounds: number;
  toolCalls: number;
  durationMs: number;
}

/**
 * Writes one agent_usage row per answer, for the operator console's AI usage
 * page (tokens, spend and activity per clinic and per account).
 *
 * Recording must never cost the user their answer: a failure here is logged
 * and swallowed. The row lands in the request's tenant through the column
 * default, like every other write.
 */
@Injectable()
export class UsageRecorder {
  private readonly logger = new Logger(UsageRecorder.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(usage: UsageRecord): Promise<void> {
    try {
      await this.prisma.agent_usage.create({
        data: {
          user_id: usage.userId,
          model: usage.model,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          rounds: usage.rounds,
          tool_calls: usage.toolCalls,
          duration_ms: usage.durationMs,
        },
      });
    } catch (err) {
      this.logger.error(
        `Could not record assistant usage for user ${usage.userId}: ${(err as Error).message}`,
      );
    }
  }
}
