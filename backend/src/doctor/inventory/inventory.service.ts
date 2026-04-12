import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SupabaseStorageService } from '../../shared/storage/supabase-storage.service';
import { CreateInventoryItemDto } from './dto/create-item.dto';
import { UpdateInventoryItemDto } from './dto/update-item.dto';
import { CreateMovementDto } from './dto/create-movement.dto';

const INVENTORY_BUCKET = 'inventory-photos';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async uploadImage(id: bigint, file: Express.Multer.File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed');
    if (file.size > MAX_SIZE)
      throw new BadRequestException('Image must be under 5 MB');

    const item = await this.findOne(id);

    if (item.image_url) {
      const oldPath = item.image_url.split(`/${INVENTORY_BUCKET}/`)[1];
      if (oldPath) await this.storage.delete(INVENTORY_BUCKET, oldPath).catch(() => null);
    }

    const ext = file.mimetype.split('/')[1];
    const storagePath = `items/${id}/${Date.now()}.${ext}`;
    const publicUrl = await this.storage.upload(INVENTORY_BUCKET, storagePath, file.buffer, file.mimetype);

    return this.prisma.inventory_items.update({
      where: { id },
      data: { image_url: publicUrl, updated_at: new Date() },
    });
  }

  async create(dto: CreateInventoryItemDto) {
    if (dto.sku) {
      const existing = await this.prisma.inventory_items.findUnique({
        where: { sku: dto.sku },
      });
      if (existing) throw new BadRequestException('SKU already exists');
    }

    return this.prisma.inventory_items.create({
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        sku: dto.sku,
        quantity: dto.quantity ?? 0,
        minimum_quantity: dto.minimum_quantity ?? 0,
        unit: dto.unit ?? 'piece',
        cost_price: dto.cost_price ?? 0,
      },
    });
  }

  async findAll(filters: {
    category?: string;
    search?: string;
    low_stock_only?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { category, search, low_stock_only, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }
    // low stock: quantity <= minimum_quantity
    if (low_stock_only) {
      where.AND = [
        ...(where.AND ?? []),
        { quantity: { lte: this.prisma.inventory_items.fields.minimum_quantity } },
      ];
    }

    // Prisma doesn't support column-to-column comparisons in where natively,
    // so for low_stock_only we use a raw filter after fetch if needed.
    let data = await this.prisma.inventory_items.findMany({
      where: low_stock_only ? { ...where, AND: undefined } : where,
      orderBy: { name: 'asc' },
      skip: low_stock_only ? undefined : skip,
      take: low_stock_only ? undefined : limit,
    });

    if (low_stock_only) {
      data = data.filter((item) => item.quantity <= item.minimum_quantity);
      const total = data.length;
      const paginated = data.slice(skip, skip + limit);
      return {
        data: paginated,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    const total = await this.prisma.inventory_items.count({ where });
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findLowStock() {
    const all = await this.prisma.inventory_items.findMany();
    const lowStock = all.filter((item) => item.quantity <= item.minimum_quantity);
    return { data: lowStock, total: lowStock.length };
  }

  async findOne(id: bigint) {
    const item = await this.prisma.inventory_items.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async update(id: bigint, dto: UpdateInventoryItemDto) {
    await this.findOne(id);

    if (dto.sku) {
      const conflict = await this.prisma.inventory_items.findFirst({
        where: { sku: dto.sku, NOT: { id } },
      });
      if (conflict) throw new BadRequestException('SKU already in use');
    }

    return this.prisma.inventory_items.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async remove(id: bigint) {
    await this.findOne(id);
    await this.prisma.inventory_items.delete({ where: { id } });
    return { message: 'Item deleted successfully' };
  }

  async addMovement(itemId: bigint, dto: CreateMovementDto) {
    const item = await this.findOne(itemId);

    const newQuantity =
      dto.movement_type === 'in'
        ? item.quantity + dto.quantity
        : dto.movement_type === 'out'
          ? item.quantity - dto.quantity
          : dto.quantity; // adjustment = set absolute value

    if (newQuantity < 0) {
      throw new BadRequestException(
        `Insufficient stock. Current quantity: ${item.quantity}, requested out: ${dto.quantity}`,
      );
    }

    const [movement] = await this.prisma.$transaction([
      this.prisma.inventory_movements.create({
        data: {
          item_id: itemId,
          movement_type: dto.movement_type,
          quantity: dto.quantity,
          note: dto.note,
          performed_by: BigInt(dto.performed_by),
        },
      }),
      this.prisma.inventory_items.update({
        where: { id: itemId },
        data: { quantity: newQuantity, updated_at: new Date() },
      }),
    ]);

    return movement;
  }

  async getMovements(itemId: bigint, page = 1, limit = 20) {
    await this.findOne(itemId);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.inventory_movements.findMany({
        where: { item_id: itemId },
        include: {
          users: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.inventory_movements.count({ where: { item_id: itemId } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
