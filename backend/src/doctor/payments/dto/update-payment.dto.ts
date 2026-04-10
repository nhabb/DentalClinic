import { IsIn, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdatePaymentStatusDto {
  @ApiPropertyOptional({
    description:
      'Amount received in this payment. Status is auto-computed: 0 → pending, partial amount → partial, full amount → paid. Omit to set status manually.',
    example: 75.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount_paid?: number;

  @ApiPropertyOptional({
    description:
      'Override status manually. If amount_paid is provided, status is computed automatically and this field is ignored.',
    enum: ['pending', 'partial', 'paid', 'refunded', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['pending', 'partial', 'paid', 'refunded', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when payment was made (ISO 8601). Defaults to now() when fully paid.',
    example: '2026-04-10T14:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  paid_at?: string;
}
