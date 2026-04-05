import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from './supabase-storage.service';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const DOCUMENT_TYPES = ['xray', 'scan', 'report', 'prescription', 'other'];

@Injectable()
export class PatientDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async upload(params: {
    patient_id: number;
    record_id?: number;
    uploaded_by: number;
    document_type?: string;
    file: Express.Multer.File;
  }) {
    const { patient_id, record_id, uploaded_by, document_type, file } = params;

    // Validate file
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type not allowed. Allowed types: JPEG, PNG, WebP, PDF`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size exceeds the 10 MB limit');
    }
    if (document_type && !DOCUMENT_TYPES.includes(document_type)) {
      throw new BadRequestException(`Invalid document_type`);
    }

    // Validate patient exists
    const patient = await this.prisma.patient_profiles.findUnique({
      where: { id: BigInt(patient_id) },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');

    // Build a unique storage path
    const ext = file.originalname.split('.').pop();
    const storagePath = `patients/${patient_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const publicUrl = await this.storage.upload(
      storagePath,
      file.buffer,
      file.mimetype,
    );

    const doc = await this.prisma.patient_documents.create({
      data: {
        patient_id: BigInt(patient_id),
        record_id: record_id ? BigInt(record_id) : undefined,
        file_name: file.originalname,
        file_path: storagePath,
        document_type: document_type ?? 'other',
        uploaded_by: BigInt(uploaded_by),
      },
    });

    return { ...doc, url: publicUrl };
  }

  async findAll(filters: {
    patient_id?: number;
    record_id?: number;
    page?: number;
    limit?: number;
  }) {
    const { patient_id, record_id, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (patient_id) where.patient_id = BigInt(patient_id);
    if (record_id) where.record_id = BigInt(record_id);

    const [data, total] = await Promise.all([
      this.prisma.patient_documents.findMany({
        where,
        skip,
        take: limit,
        orderBy: { uploaded_at: 'desc' },
      }),
      this.prisma.patient_documents.count({ where }),
    ]);

    const dataWithUrls = data.map((doc) => ({
      ...doc,
      url: this.storage.getPublicUrl(doc.file_path),
    }));

    return {
      data: dataWithUrls,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const doc = await this.prisma.patient_documents.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return { ...doc, url: this.storage.getPublicUrl(doc.file_path) };
  }

  async remove(id: bigint) {
    const doc = await this.findOne(id);
    await this.storage.delete(doc.file_path);
    await this.prisma.patient_documents.delete({ where: { id } });
    return { message: 'Document deleted successfully' };
  }
}
