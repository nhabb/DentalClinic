import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHODS } from './payment-methods';

/** Money received against an invoice. Who recorded it is the signed-in user. */
export class RecordPaymentDto {
  @ApiProperty({ example: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiProperty({
    example: 'cash',
    enum: PAYMENT_METHODS,
  })
  @IsIn(PAYMENT_METHODS)
  payment_method: string;

  @ApiPropertyOptional({
    example: '2026-04-12',
    description:
      'The day the money was received (YYYY-MM-DD); defaults to today, never in the future',
  })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional({ example: 'First installment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
