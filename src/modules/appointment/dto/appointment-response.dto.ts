export class AppointmentResponseDto {
  id: number;
  userId: number;
  workerId: number;
  offeringId: number;
  datetime: Date;
  fixed: boolean;
  createdAt: Date;
  updatedAt: Date;
}
