import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPatientStatusDto {
  @ApiProperty()
  @IsBoolean()
  is_active: boolean;
}
