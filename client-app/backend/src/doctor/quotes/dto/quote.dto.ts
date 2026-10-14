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
import { PROCEDURES } from '../../billing/dto/create-invoice.dto';

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'declined',
  'expired',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** One priced line: a procedure, optionally on one tooth, optionally the chart record it prices. */
export class QuoteItemDto {
  @ApiPropertyOptional({
    description:
      'Planned chart record (patient_records.id) this line prices; its quoted_amount is updated when the quote is accepted',
  })
  @IsOptional()
  @IsInt()
  record_id?: number;

  @ApiProperty({ enum: PROCEDURES, example: 'Crown' })
  @IsIn(PROCEDURES as unknown as string[])
  procedure_name: string;

  @ApiPropertyOptional({ example: '16', description: 'FDI tooth number' })
  @IsOptional()
  @IsString()
  @Matches(/^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/, {
    message: 'tooth_number must be an FDI tooth number (11-48 or 51-85)',
  })
  tooth_number?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 250 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  amount: number;
}

export class CreateQuoteDto {
  @ApiProperty({ description: 'Patient profile ID' })
  @IsInt()
  patient_id: number;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Last day the prices hold (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  valid_until?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: [QuoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];
}

/** Only a draft can change; every field is optional and items replace the whole list. */
export class UpdateQuoteDto {
  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  valid_until?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ type: [QuoteItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];
}
