import { IsNumber, IsOptional, IsString, IsIn, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Patient profile ID' })
  @Type(() => Number)
  @IsNumber()
  patient_id: number;

  @ApiPropertyOptional({ description: 'Appointment ID to link this payment to' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  appointment_id?: number;

  @ApiProperty({ description: 'Payment amount', example: 150.00 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    description: 'Payment method',
    enum: ['cash', 'card', 'insurance', 'bank_transfer'],
    default: 'cash',
  })
  @IsOptional()
  @IsIn(['cash', 'card', 'insurance', 'bank_transfer'])
  payment_method?: string;

  @ApiPropertyOptional({ description: 'Optional description or notes' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID of the user creating this record' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  created_by?: number;
}
