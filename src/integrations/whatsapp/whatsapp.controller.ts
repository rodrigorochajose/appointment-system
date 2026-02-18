import { Controller, Get, Post, Query, Body, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import type { WhatsAppWebhookPayload } from './dto/whatsapp-webhook.dto';
import { log } from '@/common/logger';

@Controller('wpp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('webhook')
  async webhookVerify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const challengeResponse = this.whatsappService.verifyWebhook(mode, token, challenge);

    if (challengeResponse === null) {
      return res.status(403).send('Forbidden');
    }

    return res.status(200).send(challengeResponse);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhookEvents(@Body() body: WhatsAppWebhookPayload) {
    try {
      await this.whatsappService.processIncomingPayload(body);
    } catch (err) {
      log.error('[WhatsApp] Erro no webhook', err instanceof Error ? err : { err });
    }
    return { ok: true };
  }
}
