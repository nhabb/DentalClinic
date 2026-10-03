import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROCEDURES } from '../../billing/dto/create-invoice.dto';

/**
 * completed: work done (billable). planned: proposed work.
 * missing: tooth is absent (lost before or outside the clinic); no procedure, never billed.
 */
export const WORK_STATUSES = ['completed', 'planned', 'missing'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** FDI two-digit tooth notation: permanent 11-48, primary 51-85. */
const FDI_TOOTH = /^(?:[1-4][1-8]|[5-8][1-5])$/;

export class WorkItemDto {
  @ApiProperty({ example: '16', description: 'FDI tooth number' })
  @IsString()
  @Matches(FDI_TOOTH, { message: 'tooth_number must be an FDI tooth number (11-48 or 51-85)' })
  tooth_number: string;

  @ApiPropertyOptional({ enum: PROCEDURES, example: 'Filling', description: 'Required unless status is "missing"' })
  @ValidateIf((o: WorkItemDto) => o.status !== 'missing')
  @IsString()
  @IsIn(PROCEDURES as unknown as string[])
  procedure_name?: string;

  @ApiProperty({ enum: WORK_STATUSES, example: 'completed' })
  @IsIn([...WORK_STATUSES])
  status: WorkStatus;

  @ApiPropertyOptional({ example: 50, description: 'Price; completed items with a price are invoiced' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RecordWorkDto {
  @ApiProperty({ description: 'Patient profile ID' })
  @IsNumber()
  patient_id: number;

  @ApiProperty({ example: '2026-10-03', description: 'Date of the work (YYYY-MM-DD)' })
  @IsDateString()
  treatment_date: string;

  @ApiPropertyOptional({ description: 'Associated appointment ID' })
  @IsOptional()
  @IsNumber()
  appointment_id?: number;

  @ApiPropertyOptional({ description: 'Notes applied to the invoice and to items without their own notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Doctor user ID' })
  @IsOptional()
  @IsNumber()
  created_by?: number;

  @ApiPropertyOptional({ default: true, description: 'Create an invoice for completed items with a price' })
  @IsOptional()
  @IsBoolean()
  create_invoice?: boolean;

  @ApiProperty({ type: [WorkItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => WorkItemDto)
  items: WorkItemDto[];
}
