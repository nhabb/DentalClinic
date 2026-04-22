import { IsDateString, IsString, IsNumber, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;//This regular expression validates that the time is in the format of HH:MM, where HH can be from 00 to 23 and MM can be from 00 to 59.

export class CreateSlotDto {
  @ApiProperty({ example: '2026-04-15', description: 'Slot date (YYYY-MM-DD)' })//apiproperty is used to describe the properties of the DTO for API documentation purposes. It provides an example value and a description for the slot_date property in swagger documentation.
  @IsDateString()
  slot_date: string;

  @ApiProperty({ example: '09:00', description: 'Start time (HH:MM, 24h)' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be in HH:MM format' })
  start_time: string;

  @ApiProperty({ description: 'Doctor user ID' })
  @IsNumber()
  doctor_id: number;
}
