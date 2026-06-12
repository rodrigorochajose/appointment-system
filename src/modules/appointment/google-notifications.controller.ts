import { Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { log } from '@/common/logger';

/**
 * Recebe as push notifications do Google Calendar (events.watch).
 *
 * O corpo da notificação é vazio — o Google só envia headers `X-Goog-*` dizendo
 * "algo mudou". A validação é feita pelo `X-Goog-Channel-Token` (= GOOGLE_SYNC_TOKEN,
 * definido na criação do canal). Sempre responde 200 para o Google não reenviar.
 *
 * Sem AuthGuard de propósito: o Google não envia JWT; autenticamos pelo token do canal.
 */
@Controller('google')
export class GoogleNotificationsController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post('notifications')
  @HttpCode(HttpStatus.OK)
  async notifications(
    @Headers('x-goog-channel-id') channelId?: string,
    @Headers('x-goog-channel-token') token?: string,
    @Headers('x-goog-resource-state') resourceState?: string,
  ): Promise<{ ok: true }> {
    log.debug('google notifications: push recebido', { channelId, resourceState });

    try {
      await this.appointmentService.handleNotification({ channelId, resourceState, token });
    } catch (err) {
      // handleNotification já é tolerante, mas garantimos o 200 de qualquer forma.
      log.error('google notifications: erro inesperado', err instanceof Error ? err : { err });
    }

    return { ok: true };
  }
}
