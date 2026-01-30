import { IsString, IsDecimal } from 'class-validator';

export class CreateOfferingDto {
  @IsString()
  description: string;

  @IsDecimal()
  value: string;
}
