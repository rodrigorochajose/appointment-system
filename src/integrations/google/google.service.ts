import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class GoogleService {
  private createOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  getAuthUrl(workerId: number) {
    const oauth2Client = this.createOAuthClient();

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: workerId.toString(),
    });
  }

  async getTokens(code: string) {
    const oauth2Client = this.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  getCalendarClient(refreshToken: string) {
    const oauth2Client = this.createOAuthClient();

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return google.calendar({
      version: 'v3',
      auth: oauth2Client,
    });
  }

  async getUserEmail(tokens: any): Promise<string> {
    const oauth2Client = this.createOAuthClient();

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: 'v2',
      auth: oauth2Client,
    });

    const { data } = await oauth2.userinfo.get();

    return data.email!;
  }
}
