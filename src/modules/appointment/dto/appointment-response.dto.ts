export class AppointmentResponseDto {
  id: number;
  userId: number;
  workerId: number;
  offeringId: number;
  datetime: Date;
  fixed: boolean;
  seriesId: string | null;
  googleEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
