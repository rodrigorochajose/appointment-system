export class AppointmentResponseDto {
  id: number;
  userId: number;
  workerId: number;
  offeringId: number;
  datetime: Date;
  fixed: boolean;
  seriesId: string | null;
  /** Série fixa à qual esta linha pertence (materializada); projetadas usam-no com id=0. */
  fixedSeriesId: number | null;
  googleEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
