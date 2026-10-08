import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A working window to cut into equally long slots. */
export class CreateBulkSlotsDto {
  @ApiProperty({ description: 'Doctor user ID' })
  @IsNumber()
  doctor_id: number;

  @ApiProperty({ example: '2026-04-15', description: 'Slot date (YYYY-MM-DD)' })
  @IsDateString()
  slot_date: string;

  @ApiProperty({
    example: '09:00',
    description: 'First slot starts (HH:MM, 24h)',
  })
  @IsString()
  @Matches(TIME_REGEX, { message: 'from_time must be in HH:MM format' })
  from_time: string;

  @ApiProperty({ example: '17:00', description: 'Last slot ends (HH:MM, 24h)' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'to_time must be in HH:MM format' })
  to_time: string;

  @ApiProperty({ example: 30, description: 'Length of each slot in minutes' })
  @IsInt()
  @Min(5)
  @Max(480)
  duration_minutes: number;

  @ApiPropertyOptional({
    description:
      'Branch of the slots. Defaults to the doctor’s home branch, then the organization’s default branch.',
  })
  @IsOptional()
  @IsNumber()
  branch_id?: number;
}
