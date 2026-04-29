import { Controller, Post, Body, UseGuards, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Response } from 'express';
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

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  @Post('chat/stream')
  @ApiOperation({ summary: 'Stream a response from the clinic AI assistant (SSE)' })
  async chatStream(@Body() dto: ChatRequestDto, @Req() req: any, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const userId = parseInt(req.user.id, 10);
    try {
      for await (const token of this.agentService.chatStream(dto.messages, { userId })) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err.message ?? 'Unknown error' })}\n\n`);
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}
