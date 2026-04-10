import { IsIn, IsNumber, IsOptional, IsString, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @ApiProperty({ description: 'Short title for the expense', example: 'Electricity bill' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description: 'Expense category',
    enum: ['utilities', 'rent', 'equipment', 'supplies', 'maintenance', 'other'],
    default: 'other',
  })
  @IsOptional()
  @IsIn(['utilities', 'rent', 'equipment', 'supplies', 'maintenance', 'other'])
  category?: string;

  @ApiProperty({ description: 'Expense amount', example: 200.00 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ description: 'Additional details about the expense' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Date of the expense (YYYY-MM-DD)', example: '2026-04-10' })
  @IsDateString()
  expense_date: string;

  @ApiPropertyOptional({ description: 'ID of the user recording this expense' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  created_by?: number;
}
