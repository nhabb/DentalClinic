import {
  UseGuards,
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UploadedFile,
  UseInterceptors,
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
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { SetPatientStatusDto } from './dto/set-patient-status.dto';

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

  @Patch(':id/photo')
  @ApiOperation({ summary: 'Upload or replace a patient profile photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  updatePhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.patientsService.updatePhoto(BigInt(id), file);
  }

  @Patch('by-user/:userId')
  @ApiOperation({ summary: 'Update patient profile by user ID' })
  updateByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientsService.updateByUserId(BigInt(userId), dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Set patient active/inactive status' })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPatientStatusDto,
  ) {
    return this.patientsService.setStatus(BigInt(id), dto.is_active);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a patient (removes user account and all associated data)',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.remove(BigInt(id));
  }
}
