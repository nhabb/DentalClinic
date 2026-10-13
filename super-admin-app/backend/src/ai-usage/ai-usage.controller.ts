import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AiUsageService } from './ai-usage.service';

/** The window is bounded so one request cannot scan years of usage; garbage means the default. */
const clampDays = (days: number): number =>
  Number.isFinite(days) ? Math.min(365, Math.max(1, Math.trunc(days))) : 30;

@ApiBearerAuth()
@ApiTags('AI usage')
@Controller('ai-usage')
export class AiUsageController {
  constructor(private readonly usage: AiUsageService) {}

  @Get()
  @ApiOperation({ summary: 'Assistant token usage and estimated spend per clinic' })
  @ApiQuery({ name: 'days', required: false, description: 'Window in days, default 30, max 365' })
  overview(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.usage.overview(clampDays(days));
  }

  @Get('accounts/:userId')
  @ApiOperation({ summary: 'Every answered question of one account: tokens, calls, duration, cost (never the text)' })
  @ApiQuery({ name: 'days', required: false })
  account(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.usage.account(BigInt(userId), clampDays(days));
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Assistant token usage per account of one clinic' })
  @ApiQuery({ name: 'days', required: false })
  clinic(
    @Param('id', ParseIntPipe) id: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.usage.clinic(BigInt(id), clampDays(days));
  }
}
