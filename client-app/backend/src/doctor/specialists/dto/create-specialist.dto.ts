import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSpecialistDto {
  @ApiProperty({ example: 'Dr. Rana Khoury' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'Oral surgeon' })
  @IsString()
  @MaxLength(255)
  specialty: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Where the specialist practises' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  clinic_name?: string;

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
