import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export const BLOOD_TYPES = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const;
export const GENDERS = ['male', 'female', 'other'] as const;

/**
 * Admin-side patient creation: creates the user account and its patient profile together.
 * Email is optional (some patients have none) but at least one of email / phone is required.
 * When an email is given, a password setup link is emailed to the patient.
 */
export class CreatePatientDto {
  @ApiPropertyOptional({
    example: 'jane@example.com',
    description: 'Optional, but email or phone is required',
  })
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string;

  @ApiPropertyOptional({ example: '+961 70 000 000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD', example: '1990-05-14' })
  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn([...GENDERS])
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ enum: BLOOD_TYPES })
  @IsOptional()
  @IsIn([...BLOOD_TYPES])
  blood_type?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated list',
    example: 'Penicillin, Latex',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergies?: string;

  @ApiPropertyOptional({ example: 'AXA' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  insurance_provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  medical_notes?: string;
}
