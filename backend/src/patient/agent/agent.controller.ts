import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AgentService, ChatMessage } from './agent.service';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';

class ChatMessageDto {
  @IsString() role: 'user' | 'assistant';
  @IsString() content: string;
}

class ChatRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessage[];
}

@ApiTags('Agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the clinic AI assistant' })
  async chat(@Body() dto: ChatRequestDto, @Req() req: any): Promise<{ reply: string }> {
    const userId = parseInt(req.user.id, 10);
    const reply = await this.agentService.chat(dto.messages, { userId });
    return { reply };
  }
}
