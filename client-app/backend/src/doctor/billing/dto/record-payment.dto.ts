import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordPaymentDto {
  @ApiProperty({ example: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiProperty({ example: 'cash', enum: ['cash', 'card', 'insurance', 'bank_transfer'] })
  @IsIn(['cash', 'card', 'insurance', 'bank_transfer'])
  payment_method: string;

  @ApiPropertyOptional({ example: 'First installment' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  created_by?: number;
}
