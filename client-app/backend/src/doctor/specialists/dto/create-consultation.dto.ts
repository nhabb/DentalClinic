import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CONSULTATION_STATUSES = [
  'requested',
  'scheduled',
  'completed',
  'cancelled',
] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export class CreateConsultationDto {
  @ApiProperty({ description: 'patient_profiles.id' })
  @Type(() => Number)
  @IsInt()
  patient_id: number;

  @ApiProperty({ description: 'specialists.id' })
  @Type(() => Number)
  @IsInt()
  specialist_id: number;

  @ApiPropertyOptional({ description: 'The visit this consultation is about' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  appointment_id?: number;

  @ApiPropertyOptional({ description: 'The clinical record it is about' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  record_id?: number;

  @ApiPropertyOptional({ enum: CONSULTATION_STATUSES, default: 'requested' })
  @IsOptional()
  @IsIn(CONSULTATION_STATUSES)
  status?: ConsultationStatus;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  consultation_date?: string;

  @ApiProperty({ description: 'Why the specialist is asked to help' })
  @IsString()
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional({ description: 'What the specialist concluded or did' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  outcome?: string;

  @ApiPropertyOptional({ description: "Specialist's fee" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  fee?: number;

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
