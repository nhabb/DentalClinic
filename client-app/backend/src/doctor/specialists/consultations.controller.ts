import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { ConsultationsService } from './consultations.service';
import {
  CONSULTATION_STATUSES,
  CreateConsultationDto,
} from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

/** Cases on which an outside specialist was asked to help. */
@ApiBearerAuth()
@ApiTags('Specialists')
@RequirePermissions('specialists:read')
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Get()
  @ApiOperation({ summary: 'List specialist consultations' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'specialist_id', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: CONSULTATION_STATUSES })
  @ApiQuery({ name: 'branch_id', required: false, type: Number })
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id') patient_id?: string,
    @Query('specialist_id') specialist_id?: string,
    @Query('status') status?: string,
    @Query('branch_id') branch_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.consultations.findAll({
      patient_id: patient_id ? Number(patient_id) : undefined,
      specialist_id: specialist_id ? Number(specialist_id) : undefined,
      status,
      branch_id: branch_id ? Number(branch_id) : undefined,
      from,
      to,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a consultation' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consultations.findOne(BigInt(id));
  }

  @Post()
  @RequirePermissions('specialists:write')
  @ApiOperation({ summary: 'Ask a specialist to help on a case' })
  create(
    @Body() dto: CreateConsultationDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.consultations.create(dto, BigInt(req.user.id));
  }

  @Patch(':id')
  @RequirePermissions('specialists:write')
  @ApiOperation({ summary: 'Update a consultation (status, outcome, fee, …)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConsultationDto,
  ) {
    return this.consultations.update(BigInt(id), dto);
  }

  @Delete(':id')
  @RequirePermissions('specialists:write')
  @ApiOperation({ summary: 'Delete a consultation' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.consultations.remove(BigInt(id));
  }
}
