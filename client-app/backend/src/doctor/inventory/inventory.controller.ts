import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseFilePipe,
  ParseIntPipe,
  DefaultValuePipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-item.dto';
import { UpdateInventoryItemDto } from './dto/update-item.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

@ApiBearerAuth()
@RequirePermissions('inventory:read')
@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Add a new inventory item' })
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List inventory items' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'branch_id',
    required: false,
    type: Number,
    description: 'Only stock of this branch',
  })
  @ApiQuery({ name: 'low_stock_only', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('branch_id') branch_id?: string,
    @Query('low_stock_only') low_stock_only?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.inventoryService.findAll({
      category,
      search,
      branch_id: branch_id ? Number(branch_id) : undefined,
      low_stock_only: low_stock_only === 'true',
      page,
      limit,
    });
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get all items where quantity <= minimum_quantity' })
  findLowStock() {
    return this.inventoryService.findLowStock();
  }

  // Declared before ':id' so "movements" isn't parsed as an item ID.
  @Get('movements')
  @ApiOperation({ summary: 'List stock movements across all items' })
  @ApiQuery({ name: 'item_id', required: false, type: Number })
  @ApiQuery({
    name: 'movement_type',
    required: false,
    enum: ['in', 'out', 'adjustment'],
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'YYYY-MM-DD, inclusive',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'YYYY-MM-DD, inclusive',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listMovements(
    @Query('item_id', new ParseIntPipe({ optional: true })) item_id?: number,
    @Query('movement_type') movement_type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const isDate = (d?: string) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isDate(from) || !isDate(to))
      throw new BadRequestException('from/to must be YYYY-MM-DD');
    return this.inventoryService.listMovements({
      item_id: item_id ? BigInt(item_id) : undefined,
      movement_type,
      from,
      to,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an inventory item by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.findOne(BigInt(id));
  }

  @Patch(':id')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Update an inventory item' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.update(BigInt(id), dto);
  }

  @Delete(':id')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Delete an inventory item' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.remove(BigInt(id));
  }

  @Post(':id/image')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Upload or replace an inventory item photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(new ParseFilePipe()) file: Express.Multer.File,
  ) {
    return this.inventoryService.uploadImage(BigInt(id), file);
  }

  @Post(':id/movements')
  @RequirePermissions('inventory:write')
  @ApiOperation({ summary: 'Record a stock movement (in / out / adjustment)' })
  addMovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMovementDto,
  ) {
    return this.inventoryService.addMovement(BigInt(id), dto);
  }

  @Get(':id/movements')
  @ApiOperation({ summary: 'Get movement history for an item' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMovements(
    @Param('id', ParseIntPipe) id: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.inventoryService.getMovements(BigInt(id), page, limit);
  }
}
