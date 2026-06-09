export class GoogleAccountResponseDto {
  id: number;
  workerId: number;
  googleCalendarId: string;
  googleRefreshToken: string;
  googleEmail: string;
  syncToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}
