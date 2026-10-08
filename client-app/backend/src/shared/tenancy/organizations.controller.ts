import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ORG_ADMIN_ROLES, Roles } from '../common/decorators/roles.decorator';
import { TenancyService } from './tenancy.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { SetOrganizationActiveDto } from './dto/set-active.dto';

@ApiBearerAuth()
@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get('me')
  @ApiOperation({
    summary: 'The organization (tenant) of the current user, with its branches',
  })
  getMine() {
    return this.tenancy.getCurrentOrganization();
  }

  @Patch('me')
  @Roles(...ORG_ADMIN_ROLES)
  @ApiOperation({ summary: 'Update the current organization profile' })
  updateMine(@Body() dto: UpdateOrganizationDto) {
    return this.tenancy.updateCurrentOrganization(dto);
  }

  // ── Platform administration ─────────────────────────────────────────────────

  @Get()
  @Roles('superadmin')
  @ApiOperation({ summary: '[superadmin] List all organizations' })
  list() {
    return this.tenancy.listOrganizations();
  }

  @Post()
  @Roles('superadmin')
  @ApiOperation({
    summary:
      '[superadmin] Create an organization with its default branch and optional first admin',
  })
  create(@Body() dto: CreateOrganizationDto) {
    return this.tenancy.createOrganization(dto);
  }

  @Get(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: '[superadmin] Get one organization' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenancy.getOrganization(BigInt(id));
  }

  @Patch(':id/active')
  @Roles('superadmin')
  @ApiOperation({
    summary: '[superadmin] Activate or deactivate an organization',
  })
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetOrganizationActiveDto,
  ) {
    return this.tenancy.setOrganizationActive(BigInt(id), dto.is_active);
  }
}
