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
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { PatientDocumentsService } from './patient-documents.service';

@ApiTags('Patient Documents')
@Controller('patient-documents')
export class PatientDocumentsController {
  constructor(
    private readonly patientDocumentsService: PatientDocumentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload a patient document to Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'patient_id', 'uploaded_by'],
      properties: {
        file: { type: 'string', format: 'binary' },
        patient_id: { type: 'integer' },
        uploaded_by: { type: 'integer' },
        record_id: { type: 'integer' },
        document_type: {
          type: 'string',
          enum: ['xray', 'scan', 'report', 'prescription', 'other'],
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('patient_id', ParseIntPipe) patient_id: number,
    @Body('uploaded_by', ParseIntPipe) uploaded_by: number,
    @Body('record_id') record_id?: string,
    @Body('document_type') document_type?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.patientDocumentsService.upload({
      patient_id,
      uploaded_by,
      record_id: record_id ? Number(record_id) : undefined,
      document_type,
      file,
    });
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Upload multiple patient documents in one request (max 10 files)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'patient_id', 'uploaded_by'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        patient_id: { type: 'integer' },
        uploaded_by: { type: 'integer' },
        record_id: { type: 'integer' },
        document_type: {
          type: 'string',
          enum: ['xray', 'scan', 'report', 'prescription', 'other'],
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage() }))
  async uploadBulk(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('patient_id', ParseIntPipe) patient_id: number,
    @Body('uploaded_by', ParseIntPipe) uploaded_by: number,
    @Body('record_id') record_id?: string,
    @Body('document_type') document_type?: string,
  ) {
    if (!files || files.length === 0)
      throw new BadRequestException('At least one file is required');

    const results = await Promise.all(
      files.map((file) =>
        this.patientDocumentsService.upload({
          patient_id,
          uploaded_by,
          record_id: record_id ? Number(record_id) : undefined,
          document_type,
          file,
        }),
      ),
    );

    return {
      uploaded: results.length,
      documents: results,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List patient documents' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'record_id', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id') patient_id?: string,
    @Query('record_id') record_id?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.patientDocumentsService.findAll({
      patient_id: patient_id ? Number(patient_id) : undefined,
      record_id: record_id ? Number(record_id) : undefined,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single document with its public URL' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientDocumentsService.findOne(BigInt(id));
  }

  @Delete('bulk')
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
  @ApiOperation({
    summary: 'Delete a single document from storage and database',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientDocumentsService.remove(BigInt(id));
  }
}
