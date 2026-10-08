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
import { LabOrdersService } from './lab-orders.service';
import {
  CreateLabOrderDto,
  LAB_ORDER_STATUSES,
  LAB_WORK_TYPES,
} from './dto/create-lab-order.dto';
import { UpdateLabOrderDto } from './dto/update-lab-order.dto';

/** Work sent to a dental lab for a case. */
@ApiBearerAuth()
@ApiTags('Lab')
@RequirePermissions('lab:read')
@Controller('lab-orders')
export class LabOrdersController {
  constructor(private readonly labOrders: LabOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List lab orders' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'lab_id', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: LAB_ORDER_STATUSES })
  @ApiQuery({ name: 'work_type', required: false, enum: LAB_WORK_TYPES })
  @ApiQuery({ name: 'branch_id', required: false, type: Number })
  @ApiQuery({
    name: 'overdue',
    required: false,
    type: Boolean,
    description: 'Only orders still at the lab and past their due date',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id') patient_id?: string,
    @Query('lab_id') lab_id?: string,
    @Query('status') status?: string,
    @Query('work_type') work_type?: string,
    @Query('branch_id') branch_id?: string,
    @Query(
      'overdue',
      new DefaultValuePipe(undefined),
      new ParseBoolPipe({ optional: true }),
    )
    overdue?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.labOrders.findAll({
      patient_id: patient_id ? Number(patient_id) : undefined,
      lab_id: lab_id ? Number(lab_id) : undefined,
      status,
      work_type,
      branch_id: branch_id ? Number(branch_id) : undefined,
      overdue,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lab order' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.labOrders.findOne(BigInt(id));
  }

  @Post()
  @RequirePermissions('lab:write')
  @ApiOperation({ summary: 'Order lab work for a case' })
  create(@Body() dto: CreateLabOrderDto, @Req() req: { user: RequestUser }) {
    return this.labOrders.create(dto, BigInt(req.user.id));
  }

  @Patch(':id')
  @RequirePermissions('lab:write')
  @ApiOperation({
    summary: 'Update a lab order',
    description:
      'Moving to sent, received or fitted stamps the matching date when none is given.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLabOrderDto,
  ) {
    return this.labOrders.update(BigInt(id), dto);
  }

  @Delete(':id')
  @RequirePermissions('lab:write')
  @ApiOperation({ summary: 'Delete a lab order' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.labOrders.remove(BigInt(id));
  }
}
