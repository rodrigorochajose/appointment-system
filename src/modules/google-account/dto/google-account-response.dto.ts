export class GoogleAccountResponseDto {
  id: number;
  workerId: number;
  googleCalendarId: string;
  googleRefreshToken: string;
  googleEmail: string;
  syncToken: string | null;
  watchChannelId: string | null;
  watchResourceId: string | null;
  watchExpiration: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
