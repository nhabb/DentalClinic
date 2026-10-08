import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    this.client = createClient(url, key);
  }

  async upload(
    bucket: string,
    filePath: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(filePath, buffer, { contentType: mimeType, upsert: true });

    if (error) {
      throw new InternalServerErrorException(
        `File upload failed: ${error.message}`,
      );
    }

    return this.getPublicUrl(bucket, filePath);
  }

  async delete(bucket: string, filePath: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([filePath]);
    if (error) {
      throw new InternalServerErrorException(
        `File deletion failed: ${error.message}`,
      );
    }
  }

  getPublicUrl(bucket: string, filePath: string): string {
    const { data } = this.client.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  }
}
