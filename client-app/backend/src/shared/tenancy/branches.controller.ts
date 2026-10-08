import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { ORG_ADMIN_ROLES, Roles } from '../common/decorators/roles.decorator';
import { TenancyService } from './tenancy.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@ApiBearerAuth()
@ApiTags('Branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @ApiOperation({
    summary: 'List the branches (clinic locations) of the current organization',
  })
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  list(@Query('include_inactive') includeInactive?: string) {
    return this.tenancy.listBranches(includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one branch' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenancy.getBranch(BigInt(id));
  }

  @Post()
  @Roles(...ORG_ADMIN_ROLES)
  @ApiOperation({ summary: 'Open a new branch in the current organization' })
  create(@Body() dto: CreateBranchDto) {
    return this.tenancy.createBranch(dto);
  }

  @Patch(':id')
  @Roles(...ORG_ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a branch' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBranchDto) {
    return this.tenancy.updateBranch(BigInt(id), dto);
  }

  @Patch(':id/default')
  @Roles(...ORG_ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Make a branch the default one for new slots, appointments and stock',
  })
  setDefault(@Param('id', ParseIntPipe) id: number) {
    return this.tenancy.setDefaultBranch(BigInt(id));
  }

  @Delete(':id')
  @Roles(...ORG_ADMIN_ROLES)
  @ApiOperation({
    summary: 'Delete a branch that has no data yet (otherwise deactivate it)',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenancy.removeBranch(BigInt(id));
  }
}
