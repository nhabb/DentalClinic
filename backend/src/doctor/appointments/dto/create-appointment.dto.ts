import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'Patient profile ID' })
  @IsNumber()
  patient_id: number;

  @ApiProperty({ description: 'Appointment slot ID to book' })
  @IsNumber()
  slot_id: number;

  @ApiPropertyOptional({ description: 'Reason for the appointment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
