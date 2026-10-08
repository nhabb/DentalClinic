import { PartialType } from '@nestjs/swagger';
import { CreateLabOrderDto } from './create-lab-order.dto';

export class UpdateLabOrderDto extends PartialType(CreateLabOrderDto) {}
