import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
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

export class CreateLineItemDto {
  @ApiProperty({ example: 'Checkup', enum: PROCEDURES })
  @IsString()
  @IsIn(PROCEDURES as unknown as string[])
  procedure_name: string;

  @ApiProperty({ example: 150 })
  @Transform(({ value }) => {
    const n = Number(value);
    return isNaN(n) ? value : parseFloat(n.toFixed(2));
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999, { message: 'Amount is too large' })
  amount: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  patient_id: number;

  @ApiProperty({ example: '2026-04-12' })
  @IsDateString()
  procedure_date: string;

  @ApiPropertyOptional({
    example: 'Patient requested whitening after cleaning.',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  created_by?: number;

  @ApiProperty({ type: [CreateLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineItemDto)
  line_items: CreateLineItemDto[];
}
