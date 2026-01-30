export class UnavailablePeriodResponseDto {
  id: number;
  scheduleId: number;
  date: Date;
  begin: Date;
  end: Date;
  allDay: boolean;
  createdAt: Date;
  updatedAt: Date;
}
