import { UseGuards,
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'List all patient profiles (doctor view)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.patientsService.findAll(page, limit, search);
  }

  @Get('by-user/:userId')
  @ApiOperation({ summary: 'Get patient profile by user ID' })
  findByUserId(@Param('userId', ParseIntPipe) userId: number) {
    return this.patientsService.findByUserId(BigInt(userId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient profile by profile ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.findById(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update patient profile' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientsService.update(BigInt(id), dto);
  }

  @Patch('by-user/:userId')
  @ApiOperation({ summary: 'Update patient profile by user ID' })
  updateByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientsService.updateByUserId(BigInt(userId), dto);
  }
}
