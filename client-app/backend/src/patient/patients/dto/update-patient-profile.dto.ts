import {
  IsString,
  IsOptional,
  MaxLength,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsPhone } from '../../../shared/common/phone';

/** Marital status as a clinic records it on a patient file. */
export const MARITAL_STATUSES = [
  'single',
  'married',
  'divorced',
  'widowed',
  'other',
] as const;

/** The languages the clinic app speaks (see lib/i18n). */
export const PATIENT_LANGUAGES = ['en', 'ar', 'fr'] as const;

export class UpdatePatientProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  governate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergency_contact_name?: string;

  @ApiPropertyOptional()
  @IsPhone()
  emergency_contact_phone?: string;

  @ApiPropertyOptional({
    example: 'Spouse',
    description: 'How the emergency contact is related to the patient',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  emergency_contact_relationship?: string;

  @ApiPropertyOptional({
    description: 'A second person to call in an emergency',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergency_contact_2_name?: string;

  @ApiPropertyOptional()
  @IsPhone()
  emergency_contact_2_phone?: string;

  @ApiPropertyOptional({ example: 'Son' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  emergency_contact_2_relationship?: string;

  @ApiPropertyOptional({ example: 'Teacher' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string;

  @ApiPropertyOptional({ example: 'Beirut Public School' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  employer?: string;

  @ApiPropertyOptional({ description: 'Daytime number at work' })
  @IsPhone()
  work_phone?: string;

  @ApiPropertyOptional({
    description:
      'National ID or civil record number, as written on the document',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  national_id?: string;

  @ApiPropertyOptional({ enum: MARITAL_STATUSES })
  @IsOptional()
  @IsIn([...MARITAL_STATUSES])
  marital_status?: string;

  @ApiPropertyOptional({ example: 'Lebanese' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nationality?: string;

  @ApiPropertyOptional({
    enum: PATIENT_LANGUAGES,
    description: 'Language to speak and write to this patient in',
  })
  @IsOptional()
  @IsIn([...PATIENT_LANGUAGES])
  preferred_language?: string;

  @ApiPropertyOptional({
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  })
  @IsOptional()
  @IsString()
  blood_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medical_notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  insurance_provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  insurance_policy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  current_medications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  profile_complete?: boolean;
}
