import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GoogleService } from './google.service';
import { GoogleAccountService } from '@/modules/google-account/google-account.service';

@Controller('google')
export class GoogleController {
  constructor(
    private googleService: GoogleService,
    private googleAccountService: GoogleAccountService,
  ) {}

  @Get('auth')
  async auth(@Query('workerId') workerId: string, @Res() res: Response) {
    const url = this.googleService.getAuthUrl(Number(workerId));
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') workerId: string,
    @Res() res: Response,
  ) {
    const tokens = await this.googleService.getTokens(code);

    if (!tokens.refresh_token) {
      return res.send('Erro: refresh token não recebido.');
    }

    const email = await this.googleService.getUserEmail(tokens);

    await this.googleAccountService.saveGoogleCredentials({
      workerId: Number(workerId),
      refreshToken: tokens.refresh_token,
      email,
    });

    return res.send('Google Calendar conectado com sucesso! Pode fechar.');
  }
}
