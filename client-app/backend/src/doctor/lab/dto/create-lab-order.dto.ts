import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const LAB_WORK_TYPES = [
  'crown',
  'bridge',
  'denture',
  'implant',
  'aligner',
  'retainer',
  'veneer',
  'other',
] as const;
export type LabWorkType = (typeof LAB_WORK_TYPES)[number];

export const LAB_ORDER_STATUSES = [
  'ordered',
  'sent',
  'received',
  'fitted',
  'cancelled',
] as const;
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number];

export class CreateLabOrderDto {
  @ApiProperty({ description: 'patient_profiles.id' })
  @Type(() => Number)
  @IsInt()
  patient_id: number;

  @ApiProperty({ description: 'dental_labs.id' })
  @Type(() => Number)
  @IsInt()
  lab_id: number;

  @ApiPropertyOptional({ description: 'The visit this work is for' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  appointment_id?: number;

  @ApiPropertyOptional({ description: 'The clinical record it is for' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  record_id?: number;

  @ApiProperty({ enum: LAB_WORK_TYPES })
  @IsIn(LAB_WORK_TYPES)
  work_type: LabWorkType;

  @ApiPropertyOptional({ description: 'Material, instructions, …' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Teeth concerned, FDI numbers separated by commas',
    example: '14,15',
  })
  @IsOptional()
  @Matches(/^\d{1,2}(\s*,\s*\d{1,2})*$/, {
    message:
      'tooth_numbers must be tooth numbers separated by commas, e.g. 14,15',
  })
  tooth_numbers?: string;

  @ApiPropertyOptional({ example: 'A2' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shade?: string;

  @ApiPropertyOptional({ enum: LAB_ORDER_STATUSES, default: 'ordered' })
  @IsOptional()
  @IsIn(LAB_ORDER_STATUSES)
  status?: LabOrderStatus;

  @ApiPropertyOptional({ description: 'Sent to the lab on, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  sent_at?: string;

  @ApiPropertyOptional({ description: 'Expected back on, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  due_at?: string;

  @ApiPropertyOptional({ description: 'Received from the lab on, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  received_at?: string;

  @ApiPropertyOptional({ description: 'Fitted to the patient on, YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  fitted_at?: string;

  @ApiPropertyOptional({ description: "Lab's charge" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Branch of the case. Defaults to your home branch, then the organization’s default branch.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branch_id?: number;
}
