import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsPhone } from '../../../shared/common/phone';

export class CreateLabDto {
  @ApiProperty({ example: 'Beirut Dental Lab' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsPhone()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    example: 'Rami Khoury',
    description: 'Named person to deal with at the lab',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact_person?: string;

  @ApiPropertyOptional({
    example: 7,
    description:
      "Working days the lab usually takes; a new order's due date defaults from this",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  turnaround_days?: number;

  @ApiPropertyOptional({ example: '30 days' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payment_terms?: string;

  @ApiPropertyOptional({ description: 'Tax or VAT registration number' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tax_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
