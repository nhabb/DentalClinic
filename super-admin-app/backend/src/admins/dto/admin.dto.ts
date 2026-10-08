import { IsBoolean, IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminDto {
  @ApiProperty({ example: 'ops@dental-platform.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Nour' })
  @IsString()
  @Length(1, 100)
  first_name: string;

  @ApiProperty({ example: 'Khalil' })
  @IsString()
  @Length(1, 100)
  last_name: string;

  @ApiProperty({ description: 'At least 8 characters with upper, lower case and a digit' })
  @IsString()
  @Length(8, 100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain an uppercase letter, a lowercase letter and a digit',
  })
  password: string;
}

export class SetAdminActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  is_active: boolean;
}
