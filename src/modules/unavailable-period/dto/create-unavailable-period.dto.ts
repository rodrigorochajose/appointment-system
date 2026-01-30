import { IsInt, IsDateString, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateUnavailablePeriodDto {
  @IsInt()
  scheduleId: number;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsDateString()
  @IsNotEmpty()
  begin: string;

  @IsDateString()
  @IsNotEmpty()
  end: string;

  @IsBoolean()
  @IsNotEmpty()
  allDay: boolean;
}
