import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { PlanService } from './plan.service';
import { UpdatePlanNotesDto } from './dto/quote.dto';

type AuthedRequest = { user: RequestUser };

/**
 * The treatment plan, which is also the quote.
 *
 * There is one plan per patient and it is built on the dental chart, so there
 * is nothing here that creates or edits plan lines: adding, repricing and
 * completing work are `/patient-work` routes, because they are clinical acts.
 * What is left is reading the plan, handing it to the patient, recording that
 * they agreed, and a note.
 *
 * Reading needs billing:read; giving it to a patient or recording their
 * acceptance needs billing:create, the same key that prepares any other
 * document.
 */
@ApiBearerAuth()
@RequirePermissions('billing:read')
@ApiTags('Treatment plans')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly plans: PlanService) {}

  @Get()
  @ApiOperation({ summary: "Every patient's treatment plan, newest first" })
  list() {
    return this.plans.list();
  }

  @Get('patients/:patientId')
  @ApiOperation({
    summary:
      "One patient's plan: its lines with where each stands, the figures, and when it was last given to them",
  })
  readForPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.plans.read(BigInt(patientId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'A treatment plan by its own id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.plans.readById(BigInt(id));
  }

  @Post(':id/send')
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary:
      'Give the plan to the patient: stamps a dated record of exactly what they were handed',
  })
  send(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.plans.send(BigInt(id), BigInt(req.user.id));
  }

  @Post(':id/accept')
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary:
      'Record that the patient agreed. A dated fact; the plan stays editable, because treatment changes',
  })
  accept(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.plans.accept(BigInt(id), BigInt(req.user.id));
  }

  @Patch(':id/notes')
  @RequirePermissions('billing:create')
  @ApiOperation({ summary: 'A note on the plan' })
  setNotes(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanNotesDto,
    @Req() req: AuthedRequest,
  ) {
    return this.plans.setNotes(
      BigInt(id),
      dto.notes ?? null,
      BigInt(req.user.id),
    );
  }
}
