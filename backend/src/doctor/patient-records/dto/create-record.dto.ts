import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const RECORD_TYPES = [
  'general_note',
  'diagnosis',
  'treatment',
  'prescription',
  'xray',
  'lab_result',
  'follow_up',
];

export class CreatePatientRecordDto {
  @ApiProperty({ description: 'Patient profile ID' })
  @IsNumber()
  patient_id: number;

  @ApiPropertyOptional({ description: 'Associated appointment ID' })
  @IsOptional()
  @IsNumber()
  appointment_id?: number;

  @ApiProperty({ enum: RECORD_TYPES, default: 'general_note' })
  @IsIn(RECORD_TYPES)
  record_type: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  description: string;

  @ApiPropertyOptional({ description: 'Tooth number (e.g. "14" or "UL1")' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tooth_number?: string;

  @ApiPropertyOptional({ description: 'Date of treatment (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  treatment_date?: string;

  @ApiProperty({ description: 'Doctor user ID (who created this record)' })
  @IsNumber()
  created_by: number;
}
