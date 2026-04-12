import { IsIn, IsOptional, IsDateString, IsNumber, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/** Used by PATCH /payments/:id — edit core invoice fields */
export class UpdatePaymentDto {
  @ApiPropertyOptional({ description: 'Corrected total invoice amount', example: 1600.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Payment method',
    enum: ['cash', 'card', 'insurance', 'bank_transfer'],
  })
  @IsOptional()
  @IsIn(['cash', 'card', 'insurance', 'bank_transfer'])
  payment_method?: string;

  @ApiPropertyOptional({ description: 'Treatment description or notes' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Linked appointment ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  appointment_id?: number;
}

/** Used by PATCH /payments/:id/status — record a payment or change status */
export class UpdatePaymentStatusDto {
  @ApiPropertyOptional({
    description:
      'Amount received in this payment. Status is auto-computed: partial amount → partial, full amount → paid. Omit to set status manually.',
    example: 75.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount_paid?: number;

  @ApiPropertyOptional({
    description:
      'Override status manually. Ignored when amount_paid is provided.',
    enum: ['pending', 'partial', 'paid', 'refunded', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['pending', 'partial', 'paid', 'refunded', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when payment was made (ISO 8601). Defaults to now().',
    example: '2026-04-10T14:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  paid_at?: string;
}
