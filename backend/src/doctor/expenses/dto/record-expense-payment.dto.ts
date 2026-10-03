import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const EXPENSE_PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'other'] as const;

export class RecordExpensePaymentDto {
  @ApiProperty({ description: 'Amount paid now (must not exceed the remaining balance)', example: 100 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiPropertyOptional({ enum: EXPENSE_PAYMENT_METHODS, default: 'cash' })
  @IsOptional()
  @IsIn([...EXPENSE_PAYMENT_METHODS])
  payment_method?: string;

  @ApiPropertyOptional({ description: 'Date of the payment (YYYY-MM-DD). Defaults to today.' })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional({ example: 'First installment' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'ID of the user recording this payment' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  created_by?: number;
}
