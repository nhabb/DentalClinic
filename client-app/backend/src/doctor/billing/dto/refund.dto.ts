import {
  IsIn,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { PAYMENT_METHODS } from './payment-methods';

/** Money returned to the patient against an invoice they had paid. */
export class RefundDto {
  @ApiProperty({ example: 50, description: 'Amount returned (positive)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiProperty({ example: 'cash', enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  payment_method: string;

  @ApiProperty({
    example: 'Crown remade by the lab at no charge',
    description:
      'Why the money is returned; shown on the invoice and in the audit log',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
