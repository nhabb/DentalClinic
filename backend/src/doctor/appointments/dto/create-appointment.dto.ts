import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateAppointmentDto {
  @ApiPropertyOptional({ description: 'Patient profile ID' })
  @IsNumber()
  patient_id: number;

  @ApiPropertyOptional({
    description:
      'Existing slot ID to book. If omitted, provide doctor_id + appointment_date + start_time + end_time.',
  })
  @IsOptional()
  @IsNumber()
  slot_id?: number;

  // ── Direct booking (used when slot_id is not provided) ──────────

  @ApiPropertyOptional({
    description: 'Doctor user ID (required when slot_id is omitted)',
  })
  @ValidateIf((o) => !o.slot_id)
  @IsNumber()
  doctor_id?: number;

  @ApiPropertyOptional({
    example: '2026-05-01',
    description:
      'Appointment date YYYY-MM-DD (required when slot_id is omitted)',
  })
  @ValidateIf((o) => !o.slot_id)
  @IsDateString()
  appointment_date?: string;

  @ApiPropertyOptional({
    example: '09:00',
    description: 'Start time HH:MM (required when slot_id is omitted)',
  })
  @ValidateIf((o) => !o.slot_id)
  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be in HH:MM format' })
  start_time?: string;

  @ApiPropertyOptional({
    example: '10:00',
    description: 'End time HH:MM (required when slot_id is omitted)',
  })
  @ValidateIf((o) => !o.slot_id)
  @IsString()
  @Matches(TIME_REGEX, { message: 'end_time must be in HH:MM format' })
  end_time?: string;

  // ── Shared optional fields ───────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Auto-confirm the appointment on creation (used by admin/doctor booking)',
  })
  @IsOptional()
  auto_confirm?: boolean;

  @ApiPropertyOptional({ description: 'Reason for the appointment' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Required procedure duration in minutes — slot must be at least this long',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration_minutes?: number;
}
