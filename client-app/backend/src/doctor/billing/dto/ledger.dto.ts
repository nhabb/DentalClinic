import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PAYMENT_METHODS } from './payment-methods';

/**
 * Money taken from a patient before — or beyond — any one bill: the deposit on
 * an accepted treatment plan, or a payment at a visit that should settle
 * whatever is owed. Who took it is the signed-in user.
 */
export class TakePaymentDto {
  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiProperty({ example: 'cash', enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  payment_method: string;

  @ApiPropertyOptional({
    example: '2026-10-17',
    description:
      'The day the money was received (YYYY-MM-DD); defaults to today, never in the future',
  })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional({ example: 'Deposit on the implant plan' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      "Settle the patient's open invoices with it, oldest due first; whatever is left stays as credit. Pass false to hold all of it as credit (or, with invoice_id, to put it only on that bill).",
  })
  @IsOptional()
  @IsBoolean()
  auto_apply?: boolean;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Put it on this bill first. Anything beyond that bill follows auto_apply: on to their next oldest bill, or held as credit. Omit it for a plain deposit.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  invoice_id?: number;
}

/** Put part of a payment the patient has already made onto one invoice. */
export class ApplyCreditDto {
  @ApiProperty({ example: 12, description: 'The invoice to pay down.' })
  @IsNumber()
  @Min(1)
  invoice_id: number;

  @ApiProperty({
    example: 3200,
    description:
      "How much of the payment to apply here; never more than it has left, nor more than the invoice's balance.",
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;
}

/** Money handed back out of a patient's unapplied credit. */
export class RefundCreditDto {
  @ApiProperty({ example: 1800 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @ApiProperty({ example: 'cash', enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  payment_method: string;

  @ApiProperty({ example: 'Patient abandoned the implant plan' })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ example: '2026-10-17' })
  @IsOptional()
  @IsDateString()
  payment_date?: string;
}
