import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class BranchInputDto {
  @ApiProperty({ example: 'Beirut Branch' })
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiPropertyOptional({ example: 'BEY' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Beirut' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Mon-Fri 8:00-18:00' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  opening_hours?: string;
}

/** The clinic's first administrator; receives a password setup link. */
export class OwnerInputDto {
  @ApiProperty({ example: 'owner@clinic.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Lina' })
  @IsString()
  @Length(1, 100)
  first_name: string;

  @ApiProperty({ example: 'Haddad' })
  @IsString()
  @Length(1, 100)
  last_name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Smile Center' })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legal_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Asia/Beirut' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class CreateOrganizationDto extends UpdateOrganizationDto {
  @ApiProperty({ example: 'Smile Center' })
  @IsString()
  @Length(1, 150)
  declare name: string;

  @ApiProperty({
    example: 'smile-center',
    description: 'Lowercase letters, digits and dashes; used in URLs and headers',
  })
  @IsString()
  @Length(2, 60)
  @Matches(SLUG_REGEX, { message: 'slug must be lowercase letters, digits and single dashes' })
  slug: string;

  @ApiPropertyOptional({ type: BranchInputDto, description: 'Default branch; "Main Branch" when omitted' })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchInputDto)
  default_branch?: BranchInputDto;

  @ApiPropertyOptional({ type: OwnerInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerInputDto)
  owner?: OwnerInputDto;
}

export class SetActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  is_active: boolean;
}

export class CreateBranchDto extends BranchInputDto {
  @ApiPropertyOptional({ description: 'Make it the branch new rows default to' })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdateBranchDto {
  @ApiPropertyOptional({ example: 'Tyre Branch' })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @ApiPropertyOptional({ example: 'TYR' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: 'Tyre' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  opening_hours?: string;

  @ApiPropertyOptional({ description: 'Inactive branches take no new slots, appointments or stock' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateStaffDto extends OwnerInputDto {
  @ApiPropertyOptional({ enum: ['admin', 'doctor', 'secretary'], default: 'admin' })
  @IsOptional()
  @IsIn(['admin', 'doctor', 'secretary'])
  role?: string;
}
