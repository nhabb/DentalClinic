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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
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
    name: 'from',
    required: false,
    description: 'Start date YYYY-MM-DD',
  })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('category') category?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.expensesService.findAll({ category, from, to, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single expense by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.findOne(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense record' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(BigInt(id), dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense record' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.expensesService.remove(BigInt(id));
  }
}
