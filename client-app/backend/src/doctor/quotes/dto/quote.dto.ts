import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A treatment plan has almost nothing a request can set: its lines are chart
 * work, its total is summed from them, and what a patient was handed is written
 * by the act of handing it over. A note is what is left.
 */
export class UpdatePlanNotesDto {
  @ApiPropertyOptional({ example: 'Patient prefers to stage the upper arch.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
