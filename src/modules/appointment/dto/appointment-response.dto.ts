export class AppointmentResponseDto {
  id: number;
  userId: number;
  workerId: number;
  offeringId: number;
  datetime: Date;
  fixed: boolean;
  googleEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
