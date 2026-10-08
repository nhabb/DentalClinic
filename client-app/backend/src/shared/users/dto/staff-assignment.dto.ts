import { IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/decorators/roles.decorator';

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

  @ApiPropertyOptional({ enum: STAFF_ROLES })
  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: string;

  @ApiPropertyOptional({
    description: 'Deactivated accounts are rejected within a minute',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
