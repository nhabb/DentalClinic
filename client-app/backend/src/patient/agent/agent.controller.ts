import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AgentService, ChatMessage } from './agent.service';
import { ConversationStore } from './conversation-store';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';

/** Only the new message: the history is the server's, never the client's. */
class ChatRequestDto {
  @IsString() @MinLength(1) @MaxLength(20_000) message: string;
}

type AuthedRequest = { user: RequestUser };

/**
 * The clinic AI assistant. Every route acts on the caller's own conversation,
 * which lives on the server (ConversationStore): a signed-in person sees and
 * continues their own chat only, and nothing a previous person said or was
 * told on the same browser can reach the model.
 */
@ApiTags('Agent')
@ApiBearerAuth()
@RequirePermissions('agent:use')
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly conversations: ConversationStore,
  ) {}

  @Get('chat')
  @ApiOperation({ summary: 'The conversation of the signed-in user' })
  async history(
    @Req() req: AuthedRequest,
  ): Promise<{ messages: ChatMessage[] }> {
    return { messages: await this.conversations.history(BigInt(req.user.id)) };
  }

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the clinic AI assistant' })
  async chat(
    @Body() dto: ChatRequestDto,
    @Req() req: AuthedRequest,
  ): Promise<{ reply: string }> {
    const userId = BigInt(req.user.id);
    const question: ChatMessage = { role: 'user', content: dto.message };
    const history = await this.conversations.history(userId);
    // The whole request user goes in: the assistant filters its tools by permissions.
    const reply = await this.agentService.chat(
      [...history, question],
      req.user,
    );
    await this.conversations.append(userId, [
      question,
      { role: 'assistant', content: reply },
    ]);
    return { reply };
  }

  @Delete('chat')
  @ApiOperation({
    summary: 'Start a new conversation (forgets the current one)',
  })
  async clear(@Req() req: AuthedRequest): Promise<{ message: string }> {
    await this.conversations.clear(BigInt(req.user.id));
    return { message: 'Conversation cleared' };
  }
}
