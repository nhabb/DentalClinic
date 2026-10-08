import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { AccessControlService } from '../../shared/access/access-control.service';
import { PatientDocumentsService } from './patient-documents.service';

type AuthedRequest = { user: RequestUser };

const uploadBodySchema = (filesField: 'file' | 'files') => ({
  schema: {
    type: 'object',
    required: [filesField, 'patient_id'],
    properties: {
      [filesField]:
        filesField === 'file'
          ? { type: 'string', format: 'binary' }
          : { type: 'array', items: { type: 'string', format: 'binary' } },
      patient_id: { type: 'integer' },
      record_id: { type: 'integer' },
      document_type: {
        type: 'string',
        enum: ['xray', 'scan', 'report', 'prescription', 'other'],
      },
    },
  },
});

/**
 * X-rays, scans and reports attached to a patient. Uploading and deleting
 * needs `documents:write`; reading needs `documents:read`, except that a
 * patient can always read their own. The uploader is always the caller.
 */
@ApiBearerAuth()
@ApiTags('Patient Documents')
@Controller('patient-documents')
export class PatientDocumentsController {
  constructor(
    private readonly patientDocumentsService: PatientDocumentsService,
    private readonly access: AccessControlService,
  ) {}

  @Post()
  @RequirePermissions('documents:write')
  @ApiOperation({ summary: 'Upload a patient document to Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema('file'))
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @Req() req: AuthedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('patient_id', ParseIntPipe) patient_id: number,
    @Body('record_id') record_id?: string,
    @Body('document_type') document_type?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.patientDocumentsService.upload({
      patient_id,
      uploaded_by: Number(req.user.id),
      record_id: record_id ? Number(record_id) : undefined,
      document_type,
      file,
    });
  }

  @Post('bulk')
  @RequirePermissions('documents:write')
  @ApiOperation({
    summary: 'Upload multiple patient documents in one request (max 10 files)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema('files'))
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  async uploadBulk(
    @Req() req: AuthedRequest,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('patient_id', ParseIntPipe) patient_id: number,
    @Body('record_id') record_id?: string,
    @Body('document_type') document_type?: string,
  ) {
    if (!files || files.length === 0)
      throw new BadRequestException('At least one file is required');

    const results = await Promise.all(
      files.map((file) =>
        this.patientDocumentsService.upload({
          patient_id,
          uploaded_by: Number(req.user.id),
          record_id: record_id ? Number(record_id) : undefined,
          document_type,
          file,
        }),
      ),
    );

    return { uploaded: results.length, documents: results };
  }

  @Get()
  @ApiOperation({
    summary:
      'List patient documents (patients: only with their own patient_id)',
  })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'record_id', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Req() req: AuthedRequest,
    @Query('patient_id') patient_id?: string,
    @Query('record_id') record_id?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    if (patient_id) {
      await this.access.assertPatientProfileAccess(
        req.user,
        patient_id,
        'documents:read',
      );
    } else if (!this.access.hasPermission(req.user, 'documents:read')) {
      throw new ForbiddenException('patient_id is required');
    }
    return this.patientDocumentsService.findAll({
      patient_id: patient_id ? Number(patient_id) : undefined,
      record_id: record_id ? Number(record_id) : undefined,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'A single document with its public URL (patients: only their own)',
  })
  async findOne(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const doc = await this.patientDocumentsService.findOne(BigInt(id));
    await this.access.assertPatientProfileAccess(
      req.user,
      doc.patient_id,
      'documents:read',
    );
    return doc;
  }

  @Delete('bulk')
  @RequirePermissions('documents:write')
  @ApiOperation({ summary: 'Delete multiple documents by their IDs' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['ids'],
      properties: {
        ids: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
      },
    },
  })
  async removeBulk(@Body('ids') ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const results = await Promise.all(
      ids.map((id) => this.patientDocumentsService.remove(BigInt(id))),
    );
    return { deleted: results.length };
  }

  @Delete(':id')
  @RequirePermissions('documents:write')
  @ApiOperation({
    summary: 'Delete a single document from storage and database',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientDocumentsService.remove(BigInt(id));
  }
}
