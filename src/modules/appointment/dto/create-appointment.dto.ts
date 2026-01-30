import { IsInt, IsNotEmpty, IsDateString, IsBoolean, IsOptional } from 'class-validator';

export class CreateAppointmentDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;

  @IsInt()
  workerId: number;

  @IsInt()
  @IsNotEmpty()
  @IsOptional()
  offeringId: number;

  @IsDateString()
  @IsNotEmpty()
  datetime: string;

  @IsBoolean()
  @IsOptional()
  @IsNotEmpty()
  fixed: boolean;
}
