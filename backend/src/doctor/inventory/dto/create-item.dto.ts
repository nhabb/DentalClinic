import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInventoryItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Stock-keeping unit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({
    default: 0,
    description: 'Threshold for low-stock alert',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimum_quantity?: number;

  @ApiPropertyOptional({ default: 'piece' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_price?: number;
}
