import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A new patient account created by staff (legacy route; prefer POST /patients). */
export class RegisterPatientDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  first_name: string;

  @ApiProperty()
  @IsString()
  @Length(1, 100)
  last_name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 30)
  phone?: string;
}

/** A new staff account with one of the clinic's roles. */
export class CreateStaffDto extends RegisterPatientDto {
  @ApiProperty({
    description: 'A role key of this clinic (see GET /roles); not patient',
  })
  @IsString()
  @Length(2, 40)
  role: string;

  @ApiPropertyOptional({ description: 'Home branch id' })
  @IsOptional()
  @IsInt()
  branch_id?: number;

  @ApiPropertyOptional({
    description: 'Confine the account to its home branch',
  })
  @IsOptional()
  @IsBoolean()
  restrict_to_branch?: boolean;
}
