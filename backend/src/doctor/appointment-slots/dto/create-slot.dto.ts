import { IsDateString, IsString, IsNumber, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateSlotDto {
  @ApiProperty({ example: '2026-04-15', description: 'Slot date (YYYY-MM-DD)' })
  @IsDateString()
  slot_date: string;

  @ApiProperty({ example: '09:00', description: 'Start time (HH:MM, 24h)' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be in HH:MM format' })
  start_time: string;

  @ApiProperty({ example: '10:00', description: 'End time (HH:MM, 24h)' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'end_time must be in HH:MM format' })
  end_time: string;

  @ApiProperty({ description: 'Doctor user ID' })
  @IsNumber()
  doctor_id: number;
}
