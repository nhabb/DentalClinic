import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { QuotesService } from './quotes.service';
import {
  CreateQuoteDto,
  InvoiceFromQuoteDto,
  QUOTE_STATUSES,
  UpdateQuoteDto,
} from './dto/quote.dto';

type AuthedRequest = { user: RequestUser };

/**
 * Quotes are part of billing: reading them needs billing:read, preparing or
 * revising them billing:create, deciding them billing:edit and dropping a draft
 * billing:delete. Deleting a draft is not a money operation, so
 * no password step-up here; sent quotes cannot be deleted at all.
 */
@ApiBearerAuth()
@RequirePermissions('billing:read')
@ApiTags('Quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  @ApiOperation({ summary: 'List quotes, newest first' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: QUOTE_STATUSES })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id', new DefaultValuePipe(0), ParseIntPipe)
    patient_id: number,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.quotes.findAll({
      patient_id: patient_id || undefined,
      status,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One quote with its lines and the invoices born from it',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quotes.findOne(BigInt(id));
  }

  @Post()
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary: 'Prepare a quote (draft) for a patient; numbered by the clinic',
  })
  create(@Body() dto: CreateQuoteDto, @Req() req: AuthedRequest) {
    return this.quotes.create(dto, BigInt(req.user.id));
  }

  @Patch(':id')
  @RequirePermissions('billing:edit')
  @ApiOperation({ summary: 'Change a draft quote (lines replace the list)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuoteDto) {
    return this.quotes.update(BigInt(id), dto);
  }

  @Post(':id/send')
  @RequirePermissions('billing:edit')
  @ApiOperation({
    summary: 'Mark the quote as given to the patient; it is frozen from now on',
  })
  send(@Param('id', ParseIntPipe) id: number) {
    return this.quotes.send(BigInt(id));
  }

  @Post(':id/accept')
  @RequirePermissions('billing:edit')
  @ApiOperation({
    summary:
      'The patient accepted: quoted prices are written onto the planned chart records',
  })
  accept(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.quotes.accept(BigInt(id), BigInt(req.user.id));
  }

  @Post(':id/decline')
  @RequirePermissions('billing:edit')
  @ApiOperation({ summary: 'The patient declined the quote' })
  decline(@Param('id', ParseIntPipe) id: number) {
    return this.quotes.decline(BigInt(id));
  }

  @Post(':id/revise')
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary:
      'Start a new version (draft) of this quote; the old one stays as the patient saw it',
  })
  revise(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.quotes.revise(BigInt(id), BigInt(req.user.id));
  }

  @Post(':id/invoice')
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary:
      'Issue an invoice from an accepted quote: its lines and discount, linked back to the quote (one live invoice per quote)',
  })
  createInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InvoiceFromQuoteDto,
    @Req() req: AuthedRequest,
  ) {
    return this.quotes.createInvoice(BigInt(id), dto, BigInt(req.user.id));
  }

  @Delete(':id')
  @RequirePermissions('billing:delete')
  @ApiOperation({ summary: 'Delete a draft quote' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.quotes.remove(BigInt(id), BigInt(req.user.id));
  }
}
