import { Controller, Post, Body, Req } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AgentService, ChatMessage } from './agent.service';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';

/** Only user and assistant turns: the system prompt is built server-side. */
class ChatMessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MaxLength(20_000) content: string;
}

class ChatRequestDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessage[];
}

@ApiTags('Agent')
@ApiBearerAuth()
@RequirePermissions('agent:use')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the clinic AI assistant' })
  async chat(
    @Body() dto: ChatRequestDto,
    @Req() req: { user: RequestUser },
  ): Promise<{ reply: string }> {
    // The whole request user goes in: the assistant filters its tools by permissions.
    const reply = await this.agentService.chat(dto.messages, req.user);
    return { reply };
  }
}
