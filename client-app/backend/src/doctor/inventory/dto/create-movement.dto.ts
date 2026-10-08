import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMovementDto {
  @ApiProperty({ enum: ['in', 'out', 'adjustment'] })
  @IsIn(['in', 'out', 'adjustment'])
  movement_type: string;

  @ApiProperty({ description: 'Quantity (must be positive)' })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: 'User ID of who performed this movement' })
  @IsNumber()
  performed_by: number;
}
