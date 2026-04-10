import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { PaymentsService } from '../../doctor/payments/payments.service';
import { PatientsService } from '../patients/patients.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patient — Payments')
@Controller('patient/payments')
export class PatientPaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly patientsService: PatientsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all payments for a patient' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'partial', 'paid'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const profile = await this.patientsService.findByUserId(BigInt(userId));
    return this.paymentsService.findAll({
      patient_id: Number(profile.id),
      status,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single payment (must belong to the patient)' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('user_id', ParseIntPipe) userId: number,
  ) {
    const profile = await this.patientsService.findByUserId(BigInt(userId));
    const payment = await this.paymentsService.findOne(BigInt(id));

    if (payment.patient.id.toString() !== profile.id.toString()) {
      throw new ForbiddenException('This payment does not belong to you');
    }

    return payment;
  }
}
