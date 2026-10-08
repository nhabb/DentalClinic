import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import {
  CreateBranchDto,
  CreateOrganizationDto,
  CreateStaffDto,
  SetActiveDto,
  UpdateBranchDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';

@ApiBearerAuth()
@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'All clinics with their key numbers' })
  list() {
    return this.organizations.list();
  }

  @Post()
  @ApiOperation({ summary: 'Onboard a clinic: organization, default branch, clinic profile and first admin' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizations.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One clinic with branches, staff, totals and six months of activity' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.organizations.getOne(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a clinic profile' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrganizationDto) {
    return this.organizations.update(BigInt(id), dto);
  }

  @Patch(':id/active')
  @ApiOperation({ summary: 'Activate or suspend a clinic (its users are locked out within a minute)' })
  setActive(@Param('id', ParseIntPipe) id: number, @Body() dto: SetActiveDto) {
    return this.organizations.setActive(BigInt(id), dto.is_active);
  }

  @Post(':id/staff')
  @ApiOperation({ summary: 'Add a staff account to a clinic; returns its password setup link' })
  createStaff(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateStaffDto) {
    return this.organizations.createStaff(BigInt(id), dto);
  }

  @Post(':id/staff/:userId/invite')
  @ApiOperation({ summary: 'Issue a new password setup link for a clinic user' })
  resendInvite(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    return this.organizations.resendInvite(BigInt(id), BigInt(userId));
  }

  // ── Branches ───────────────────────────────────────────────────────────────

  @Post(':id/branches')
  @ApiOperation({ summary: 'Open a new branch (clinic location) for a clinic' })
  createBranch(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateBranchDto) {
    return this.organizations.createBranch(BigInt(id), dto);
  }

  @Patch(':id/branches/:branchId')
  @ApiOperation({ summary: 'Update a branch (details, active flag)' })
  updateBranch(
    @Param('id', ParseIntPipe) id: number,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.organizations.updateBranch(BigInt(id), BigInt(branchId), dto);
  }

  @Patch(':id/branches/:branchId/default')
  @ApiOperation({ summary: 'Make a branch the default for new slots, stock and invoices' })
  setDefaultBranch(@Param('id', ParseIntPipe) id: number, @Param('branchId', ParseIntPipe) branchId: number) {
    return this.organizations.setDefaultBranch(BigInt(id), BigInt(branchId));
  }
}
