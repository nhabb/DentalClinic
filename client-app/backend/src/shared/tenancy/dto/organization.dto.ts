import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateBranchDto } from './branch.dto';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'BrightSmile Dental Clinic' })
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

  @ApiPropertyOptional({ description: 'Free-form tenant settings' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

/** First administrator created together with a new organization. */
export class OrganizationOwnerDto {
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

  @ApiPropertyOptional({ enum: ['admin', 'doctor'], default: 'admin' })
  @IsOptional()
  @IsIn(['admin', 'doctor'])
  role?: string;
}

export class CreateOrganizationDto extends UpdateOrganizationDto {
  @ApiProperty({ example: 'Smile Center' })
  @IsString()
  @Length(1, 150)
  declare name: string;

  @ApiProperty({
    example: 'smile-center',
    description:
      'URL-safe identifier (lowercase letters, digits, dashes). Used by X-Organization / subdomains.',
  })
  @IsString()
  @Length(2, 60)
  @Matches(SLUG_REGEX, {
    message: 'slug must be lowercase letters, digits and single dashes',
  })
  slug: string;

  @ApiPropertyOptional({
    type: CreateBranchDto,
    description: 'Default branch. Created as "Main Branch" when omitted.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBranchDto)
  default_branch?: CreateBranchDto;

  @ApiPropertyOptional({
    type: OrganizationOwnerDto,
    description: 'First admin account; receives a password setup link.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationOwnerDto)
  owner?: OrganizationOwnerDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
