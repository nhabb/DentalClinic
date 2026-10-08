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
import { SpecialistsService } from './specialists.service';
import { CreateSpecialistDto } from './dto/create-specialist.dto';
import { UpdateSpecialistDto } from './dto/update-specialist.dto';

/** Directory of outside doctors the clinic asks for help. */
@ApiBearerAuth()
@ApiTags('Specialists')
@RequirePermissions('specialists:read')
@Controller('specialists')
export class SpecialistsController {
  constructor(private readonly specialists: SpecialistsService) {}

  @Get()
  @ApiOperation({ summary: 'List outside specialists' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Name or specialty',
  })
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
    return this.specialists.findAll({ search, active, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specialist' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.specialists.findOne(BigInt(id));
  }

  @Post()
  @RequirePermissions('specialists:write')
  @ApiOperation({ summary: 'Add a specialist to the directory' })
  create(@Body() dto: CreateSpecialistDto) {
    return this.specialists.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('specialists:write')
  @ApiOperation({
    summary: 'Edit a specialist (set is_active false to retire)',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpecialistDto,
  ) {
    return this.specialists.update(BigInt(id), dto);
  }

  @Delete(':id')
  @RequirePermissions('specialists:write')
  @ApiOperation({ summary: 'Delete a specialist that has no consultations' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.specialists.remove(BigInt(id));
  }
}
