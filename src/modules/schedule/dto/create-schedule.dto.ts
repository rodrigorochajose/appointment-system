import { IsInt, IsNotEmpty } from 'class-validator';

export class CreateScheduleDto {
  @IsInt()
  @IsNotEmpty()
  workerId: number;
}
