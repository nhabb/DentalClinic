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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PROCEDURES } from './create-invoice.dto';

export class UpdateLineItemDto {
  @ApiPropertyOptional({ example: 'Checkup', enum: PROCEDURES })
  @IsString()
  @IsIn(PROCEDURES as unknown as string[])
  procedure_name: string;

  @ApiPropertyOptional({ example: 150 })
  @Transform(({ value }) => {
    const n = Number(value);
    return isNaN(n) ? value : parseFloat(n.toFixed(2));
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999_999, { message: 'Amount is too large' })
  amount: number;
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ example: '2026-04-12' })
  @IsOptional()
  @IsDateString()
  procedure_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [UpdateLineItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateLineItemDto)
  line_items?: UpdateLineItemDto[];
}
