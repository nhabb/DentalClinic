import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { IsPhone } from '../../shared/common/phone';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  first_name: string;

  @IsString()
  last_name: string;

  @IsPhone()
  phone?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
