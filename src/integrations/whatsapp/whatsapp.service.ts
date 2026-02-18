import { Injectable } from '@nestjs/common';
import type {
  WhatsAppWebhookPayload,
  WhatsAppWebhookEntry,
  IncomingMessageParsed,
} from './dto/whatsapp-webhook.dto';
import { UserService } from 'src/modules/user/user.service';
import { ConversationStep, ConversationState } from './conversation-state';
import { log } from '@/common/logger';
import { AppointmentService } from '@/modules/appointment/appointment.service';
import { ConversationStateService } from './conversation-state/conversation-state.service';

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly userService: UserService,
    private readonly appointmentService: AppointmentService,
    private readonly conversationState: ConversationStateService,
  ) {}
  private get verifyToken(): string {
    const token = process.env.WPP_VERIFY_TOKEN;
    if (!token) {
      throw new Error('WPP_VERIFY_TOKEN não configurado. Defina no .env para usar o webhook.');
    }
    return token;
  }

  verifyWebhook(
    mode: string,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    if (mode !== 'subscribe' || token !== this.verifyToken || !challenge) {
      return null;
    }
    return challenge;
  }

  async processIncomingPayload(payload: WhatsAppWebhookPayload): Promise<void> {
    const messages: IncomingMessageParsed[] = [];

    if (payload.object !== 'whatsapp_business_account' || !payload.entry?.length) {
      return;
    }

    for (const entry of payload.entry as WhatsAppWebhookEntry[]) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value || value.messaging_product !== 'whatsapp') continue;

        const phoneNumberId = value.metadata?.phone_number_id;

        for (const msg of value.messages ?? []) {
          if (!phoneNumberId) {
            log.warn('[WhatsApp] Mensagem ignorada: phone_number_id ausente no payload.');
            continue;
          }
          const parsed: IncomingMessageParsed = {
            phoneNumberId,
            from: msg.from,
            text: msg.text?.body,
          };
          messages.push(parsed);
        }
      }
    }

    if (messages.length === 0) return;

    log.debug('[WhatsApp] Mensagens recebidas');

    for (const message of messages) {
      try {
        await this.handleMessage(message);
      } catch (err) {
        log.error(
          '[WhatsApp] Erro ao processar mensagem',
          err instanceof Error ? err : { from: message.from, err },
        );
      }
    }
  }

  async getUserState(userPhone: string): Promise<ConversationState> {
    const user = await this.userService.findByPhone(userPhone);

    if (!user) {
      this.conversationState.setState(userPhone, { step: ConversationStep.SIGN_IN });
      return this.conversationState.getState(userPhone);
    }

    const userHasApt = await this.appointmentService.findManyByUserId(user.id);

    const userStep =
      userHasApt.length > 0 ? ConversationStep.FULL_MENU : ConversationStep.SCHEDULE_MENU;

    this.conversationState.setState(userPhone, { step: userStep });

    return this.conversationState.getState(userPhone);
  }

  async handleMessage(data: IncomingMessageParsed): Promise<void> {
    let state = this.conversationState.getState(data.from);

    if (!state) {
      state = await this.getUserState(data.from);
    }

    switch (state.step) {
      case ConversationStep.SIGN_IN:
        await this.sendTextMessage(
          data.phoneNumberId,
          data.from,
          'Olá! Verifiquei que você ainda não está cadastrado. Vamos fazer um breve cadastro para que possa ser identificado em futuros agendamentos.\n Vou te pedir apenas duas informações\n\n Primeiro me informe seu nome completo',
        );
        this.conversationState.setState(data.from, { step: ConversationStep.SIGN_IN_GET_NAME });
        break;
      case ConversationStep.SIGN_IN_GET_NAME:
        log.info('[WhatsApp] Nome informado', { name: data.text });

        await this.sendTextMessage(
          data.phoneNumberId,
          data.from,
          'Agora me informe seu email completo',
        );
        this.conversationState.setState(data.from, { step: ConversationStep.SIGN_IN_GET_EMAIL });
        break;
      case ConversationStep.SIGN_IN_GET_EMAIL:
        log.info('[WhatsApp] Email informado', { email: data.text });

        await this.sendTextMessage(
          data.phoneNumberId,
          data.from,
          'Agora me informe seu email completo',
        );
        this.conversationState.setState(data.from, { step: ConversationStep.SIGN_IN_GET_EMAIL });
        break;
      case ConversationStep.CHECK_APT:
      case ConversationStep.FULL_MENU:
      case ConversationStep.CANCEL_MANY:
      case ConversationStep.CANCEL_CONFIRM:
      case ConversationStep.CANCEL_CONFIRM_ALL:
      case ConversationStep.CANCEL_CONFIRMED:
      case ConversationStep.RESCHEDULE_MANY:
      case ConversationStep.RESCHEDULE_CONFIRM:
      case ConversationStep.SCHEDULE_MENU:
      case ConversationStep.SCHEDULE_BY_DAY:
      case ConversationStep.SCHEDULE_BY_DAY_LIST:
      case ConversationStep.SCHEDULE_NEXT_AVAILABLE_LIST:
      case ConversationStep.SCHEDULE_BY_DAY_HOUR:
      case ConversationStep.SCHEDULE_BY_DAY_HOUR_UNAVAILABLE:
      case ConversationStep.SCHEDULE_CONFIRM:
      case ConversationStep.SCHEDULE_CONFIRMED:
      case ConversationStep.CLOSE:
    }
  }

  async sendTextMessage(
    phoneNumberId: string,
    to: string,
    text: string,
    previewUrl = false,
  ): Promise<void> {
    const token = process.env.WPP_TOKEN;
    if (!token) {
      throw new Error('WPP_TOKEN não configurado. Defina no .env para enviar mensagens.');
    }

    const normalizedTo = to.replace(/\D/g, '');
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'text',
      text: {
        body: text.slice(0, 4096),
        ...(previewUrl && { preview_url: true }),
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      error?: { message: string; code: number };
      messages?: Array<{ id: string }>;
    };

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`WhatsApp API: ${msg}`);
    }

    const messageId = data.messages?.[0]?.id;
    if (messageId) {
      log.info('[WhatsApp] Mensagem enviada', { to: normalizedTo, messageId });
    }
  }
}
