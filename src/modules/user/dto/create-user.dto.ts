import { IsEmail, IsInt, IsOptional, IsPhoneNumber, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsPhoneNumber('BR')
  phone: string;

  /** Vincula esta identidade a um profissional, tornando-a um barbeiro. */
  @IsOptional()
  @IsInt()
  workerId?: number;
}
