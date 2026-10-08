import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetOrganizationActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  is_active: boolean;
}
