import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Admin-only changes to how a staff account is allowed to work: which branch is
 * home, whether the account is confined to it, its role and whether it is active.
 */
export class StaffAssignmentDto {
  @ApiPropertyOptional({ description: 'Home branch id; null clears it' })
  @IsOptional()
  @IsInt()
  branch_id?: number | null;

  @ApiPropertyOptional({
    description:
      'Confine this account to its home branch (ignored for admins). Requires a home branch.',
  })
  @IsOptional()
  @IsBoolean()
  restrict_to_branch?: boolean;

  @ApiPropertyOptional({
    description: 'A role key of this clinic (see GET /roles); not patient',
  })
  @IsOptional()
  @IsString()
  @Length(2, 40)
  role?: string;

  @ApiPropertyOptional({
    description: 'Deactivated accounts are rejected within a minute',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
