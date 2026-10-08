import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { PlatformUser } from '../auth/auth.service';
import { AccountsService } from './accounts.service';
import { UpdateAccountDto } from './dto/account.dto';

const kindOf = (v?: string): 'staff' | 'patients' | 'all' | undefined =>
  v === 'staff' || v === 'patients' || v === 'all' ? v : undefined;

/** Every clinic's accounts, seen and edited from the platform. */
@ApiBearerAuth()
@ApiTags('Accounts')
@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'Search accounts across all clinics' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'organization_id', required: false, type: Number })
  @ApiQuery({ name: 'kind', required: false, enum: ['staff', 'patients', 'all'] })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAll(
    @Query('search') search?: string,
    @Query('organization_id') organizationId?: string,
    @Query('kind') kind?: string,
    @Query('role') role?: string,
    @Query('active', new DefaultValuePipe(undefined), new ParseBoolPipe({ optional: true })) active?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit?: number,
  ) {
    return this.accounts.list({
      search,
      organizationId: organizationId ? BigInt(organizationId) : undefined,
      kind: kindOf(kind) ?? 'staff',
      role,
      active,
      page,
      limit,
    });
  }

  @Get('organizations/:id/accounts')
  @ApiOperation({ summary: 'Accounts of one clinic (staff by default; kind=patients or all)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'kind', required: false, enum: ['staff', 'patients', 'all'] })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listForClinic(
    @Param('id', ParseIntPipe) id: number,
    @Query('search') search?: string,
    @Query('kind') kind?: string,
    @Query('role') role?: string,
    @Query('active', new DefaultValuePipe(undefined), new ParseBoolPipe({ optional: true })) active?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit?: number,
  ) {
    return this.accounts.list({
      organizationId: BigInt(id),
      search,
      kind: kindOf(kind) ?? 'staff',
      role,
      active,
      page,
      limit,
    });
  }

  @Patch('organizations/:id/accounts/:userId')
  @ApiOperation({ summary: 'Edit an account: name, contact, role, branch, restriction, active' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateAccountDto,
    @Req() req: { user: PlatformUser },
  ) {
    return this.accounts.update(BigInt(id), BigInt(userId), dto, req.user.id);
  }

  @Post('organizations/:id/accounts/:userId/password-reset')
  @ApiOperation({ summary: 'Issue (and email, when SMTP is configured) a new set-password link' })
  passwordReset(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { user: PlatformUser },
  ) {
    return this.accounts.sendPasswordReset(BigInt(id), BigInt(userId), req.user.id);
  }
}
