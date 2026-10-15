import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PROCEDURES = [
  'Checkup',
  'X-Ray',
  'Teeth Cleaning',
  'Whitening',
  'Tooth Extraction',
  'Root Canal',
  'Filling',
  'Crown',
  'Bridge',
  'Implant',
  'Orthodontic',
  'Veneers',
  'Gum Treatment',
  'Fluoride Treatment',
] as const;

/** FDI two-digit tooth notation: permanent 11-48, primary 51-85. */
export const FDI_TOOTH = /^(?:[1-4][1-8]|[5-8][1-5])$/;

export class CreateLineItemDto {
  @ApiProperty({ example: 'Checkup', enum: PROCEDURES })
  @IsString()
  @IsIn(PROCEDURES as unknown as string[])
  procedure_name: string;

  @ApiProperty({ example: 150, description: '0 is allowed (free of charge)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  amount: number;

  @ApiPropertyOptional({ example: '16', description: 'FDI tooth number' })
  @IsOptional()
  @IsString()
  @Matches(FDI_TOOTH, {
    message: 'tooth_number must be an FDI tooth number (11-48 or 51-85)',
  })
  tooth_number?: string;
}

/**
 * An invoice from the billing page. Who issued it is the signed-in user; the
 * number is assigned by the database; the figures (subtotal, discount, total)
 * are derived server-side from the lines.
 */
export class CreateInvoiceDto {
  @ApiProperty({ example: 1, description: 'Patient profile ID' })
  @IsInt()
  patient_id: number;

  @ApiProperty({ example: '2026-04-12', description: 'Date of the work' })
  @IsDateString()
  procedure_date: string;

  @ApiPropertyOptional({
    example: '2026-05-12',
    description:
      'Payment due date (payment terms). Defaults to the procedure date: due on receipt.',
  })
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({
    example: 'Patient requested whitening after cleaning.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'Taken off the subtotal; needs discount_reason',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  discount_amount?: number;

  @ApiPropertyOptional({ example: 'Family discount' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  discount_reason?: string;

  @ApiPropertyOptional({
    description:
      'Branch issuing the invoice. Defaults to your home branch, then the organization’s default branch.',
  })
  @IsOptional()
  @IsInt()
  branch_id?: number;

  @ApiProperty({ type: [CreateLineItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => CreateLineItemDto)
  line_items: CreateLineItemDto[];
}
