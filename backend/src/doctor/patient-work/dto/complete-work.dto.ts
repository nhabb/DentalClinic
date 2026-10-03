import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteWorkItemDto {
  @ApiProperty({ description: 'ID of a planned (treatment_plan) patient record' })
  @IsNumber()
  record_id: number;

  @ApiPropertyOptional({ example: 250, description: 'Price to bill; 0 or omitted = not billed' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  amount?: number;
}

/** Mark planned work as done, optionally billing all of it on one new invoice. */
export class CompleteWorkDto {
  @ApiProperty({ description: 'Patient profile ID' })
  @IsNumber()
  patient_id: number;

  @ApiPropertyOptional({ example: '2026-10-03', description: 'Date the work was done; defaults to today' })
  @IsOptional()
  @IsDateString()
  treatment_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Doctor user ID' })
  @IsOptional()
  @IsNumber()
  created_by?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  create_invoice?: boolean;

  @ApiProperty({ type: [CompleteWorkItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => CompleteWorkItemDto)
  items: CompleteWorkItemDto[];
}
