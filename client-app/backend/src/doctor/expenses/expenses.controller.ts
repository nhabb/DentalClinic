import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { RecordExpensePaymentDto } from './dto/record-expense-payment.dto';

@ApiBearerAuth()
@RequirePermissions('expenses:read')
@ApiTags('Expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @RequirePermissions('expenses:write')
  @ApiOperation({ summary: 'Record a new clinic expense' })
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.create(dto);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Monthly expense trends and breakdown by category' })
  @ApiQuery({
    name: 'months',
    required: false,
    type: Number,
    description: 'Number of past months (default 12)',
  })
  getAnalytics(
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
  ) {
    return this.expensesService.getAnalytics(months);
  }

  @Get()
  @ApiOperation({ summary: 'List expenses with optional filters' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: [
      'utilities',
      'rent',
      'equipment',
      'supplies',
      'maintenance',
      'other',
    ],
  })
  @ApiQuery({
    name: 'branch_id',
    required: false,
    type: Number,
    description: 'Only expenses of this branch',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date YYYY-MM-DD',
  })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('category') category?: string,
    @Query('branch_id') branch_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.expensesService.findAll({
      category,
      branch_id: branch_id ? Number(branch_id) : undefined,
      from,
      to,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single expense by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.findOne(BigInt(id));
  }

  @Patch(':id')
  @RequirePermissions('expenses:write')
  @ApiOperation({
    summary: 'Update an expense record',
    description:
      'Status is derived from recorded payments. Sending status "paid" records a payment for the remaining balance.',
  })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(BigInt(id), dto);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List payments recorded against an expense' })
  listPayments(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.listPayments(BigInt(id));
  }

  @Post(':id/payments')
  @RequirePermissions('expenses:write')
  @ApiOperation({
    summary: 'Record a payment (partial or full) against an expense',
  })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordExpensePaymentDto,
  ) {
    return this.expensesService.recordPayment(BigInt(id), dto);
  }

  @Delete(':id/payments/:paymentId')
  @RequirePermissions('expenses:write')
  @ApiOperation({
    summary: 'Remove a recorded expense payment and recalculate the balance',
  })
  deletePayment(
    @Param('id', ParseIntPipe) id: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
  ) {
    return this.expensesService.deletePayment(BigInt(id), BigInt(paymentId));
  }

  @Delete(':id')
  @RequirePermissions('expenses:write')
  @ApiOperation({ summary: 'Delete an expense record' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.remove(BigInt(id));
  }
}
