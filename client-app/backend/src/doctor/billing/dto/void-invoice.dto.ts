import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Cancel an invoice that is not owed after all. Nothing net-paid may remain on it. */
export class VoidInvoiceDto {
  @ApiProperty({
    example: 'Billed to the wrong patient',
    description:
      'Why the invoice is cancelled; kept on the invoice and in the audit log',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
