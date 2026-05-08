import {
  UseGuards,
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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard)
@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @ApiOperation({ summary: 'Add a new inventory item' })
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List inventory items' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'low_stock_only', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('low_stock_only') low_stock_only?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.inventoryService.findAll({
      category,
      search,
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

  @Get(':id')
  @ApiOperation({ summary: 'Get an inventory item by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.findOne(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an inventory item' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.update(BigInt(id), dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an inventory item' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.remove(BigInt(id));
  }

  @Post(':id/image')
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
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.inventoryService.uploadImage(BigInt(id), file);
  }

  @Post(':id/movements')
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
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.inventoryService.getMovements(BigInt(id), page, limit);
  }
}
