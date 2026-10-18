import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteWorkItemDto {
  @ApiProperty({
    description: 'ID of a planned (treatment_plan) patient record',
  })
  @IsNumber()
  record_id: number;
}

/**
 * Mark planned work as done. The chart is clinical: no price is given here.
 * A price reaches a record from an accepted quote (the quotes page), and the
 * billing page is where completed work is priced and billed.
 */
export class CompleteWorkDto {
  @ApiProperty({ description: 'Patient profile ID' })
  @IsNumber()
  patient_id: number;

  @ApiPropertyOptional({
    example: '2026-10-03',
    description: 'Date the work was done; defaults to today',
  })
  @IsOptional()
  @IsDateString()
  treatment_date?: string;

  @ApiProperty({ type: [CompleteWorkItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => CompleteWorkItemDto)
  items: CompleteWorkItemDto[];
}

/** A new price for one planned item on the chart. */
export class RepriceWorkDto {
  @ApiProperty({ example: 250, description: 'The agreed price for this work' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  amount: number;
}
