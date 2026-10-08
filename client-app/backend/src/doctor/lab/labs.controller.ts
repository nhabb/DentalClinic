import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import { LabsService } from './labs.service';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';

/** Directory of dental laboratories the clinic works with. */
@ApiBearerAuth()
@ApiTags('Lab')
@RequirePermissions('lab:read')
@Controller('labs')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  @ApiOperation({ summary: 'List dental labs' })
  @ApiQuery({ name: 'search', required: false, description: 'Name' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('search') search?: string,
    @Query(
      'active',
      new DefaultValuePipe(undefined),
      new ParseBoolPipe({ optional: true }),
    )
    active?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.labs.findAll({ search, active, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lab' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.labs.findOne(BigInt(id));
  }

  @Post()
  @RequirePermissions('lab:write')
  @ApiOperation({ summary: 'Add a lab to the directory' })
  create(@Body() dto: CreateLabDto) {
    return this.labs.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('lab:write')
  @ApiOperation({ summary: 'Edit a lab (set is_active false to retire)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLabDto) {
    return this.labs.update(BigInt(id), dto);
  }

  @Delete(':id')
  @RequirePermissions('lab:write')
  @ApiOperation({ summary: 'Delete a lab that has no orders' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.labs.remove(BigInt(id));
  }
}
