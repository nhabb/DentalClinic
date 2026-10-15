import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PAYMENT_METHODS } from './payment-methods';

/** Money returned to the patient against an invoice they had paid. */
export class RefundDto {
  @ApiProperty({ example: 50, description: 'Amount returned (positive)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiProperty({ example: 'cash', enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  payment_method: string;

  @ApiPropertyOptional({
    example: '2026-04-12',
    description:
      'The day the money was returned (YYYY-MM-DD); defaults to today, never in the future',
  })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiProperty({
    example: 'Crown remade by the lab at no charge',
    description:
      'Why the money is returned; shown on the invoice and in the audit log',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
