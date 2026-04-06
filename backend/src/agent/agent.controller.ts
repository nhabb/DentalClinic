import { Controller, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AgentService, ChatMessage } from './agent.service';

class ChatMessageDto {
  @IsString() role: 'user' | 'assistant';
  @IsString() content: string;
}

class ChatRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessage[];

  @IsOptional() @IsString() doctorName?: string;
  @IsOptional() @IsNumber() doctorId?: number;
}

@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the clinic AI assistant' })
  async chat(@Body() dto: ChatRequestDto): Promise<{ reply: string }> {
    const reply = await this.agentService.chat(dto.messages, {
      doctorName: dto.doctorName ?? 'Doctor',
      doctorId: dto.doctorId,
    });
    return { reply };
  }
}
