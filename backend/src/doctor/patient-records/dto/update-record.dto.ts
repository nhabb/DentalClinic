import {
  IsString,
  IsOptional,
  IsIn,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const RECORD_TYPES = [
  'general_note',
  'diagnosis',
  'treatment',
  'prescription',
  'xray',
  'lab_result',
  'follow_up',
];

export class UpdatePatientRecordDto {
  @ApiPropertyOptional({ enum: RECORD_TYPES })
  @IsOptional()
  @IsIn(RECORD_TYPES)
  record_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tooth_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  treatment_date?: string;
}
