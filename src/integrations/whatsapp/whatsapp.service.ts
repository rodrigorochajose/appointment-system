import { Injectable } from '@nestjs/common';
import type {
  WhatsAppWebhookPayload,
  WhatsAppWebhookEntry,
  IncomingMessageParsed,
} from './dto/whatsapp-webhook.dto';
import { UserService } from 'src/modules/user/user.service';
import { ConversationStep, ConversationData } from './conversation-data';
import { log } from '@/common/logger';
import { AppointmentService } from '@/modules/appointment/appointment.service';
import { ConversationDataService } from './conversation-data/conversation-data.service';
import { WhatsAppMessageHandlers } from './handlers';

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly userService: UserService,
    private readonly appointmentService: AppointmentService,
    private readonly conversationData: ConversationDataService,
    private readonly messageHandlers: WhatsAppMessageHandlers,
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

  async getUserState(userPhone: string): Promise<ConversationData> {
    const user = await this.userService.findByPhone(userPhone);

    if (!user) {
      this.conversationData.setState(userPhone, { step: ConversationStep.SIGN_IN, data: null });
      return this.conversationData.getState(userPhone);
    }

    const userHasApt = await this.appointmentService.findManyByUserId(user.id);

    const userStep =
      userHasApt.length > 0 ? ConversationStep.FULL_MENU : ConversationStep.SCHEDULE_MENU;

    this.conversationData.setState(userPhone, { step: userStep, data: null });

    return this.conversationData.getState(userPhone);
  }

  async handleMessage(data: IncomingMessageParsed): Promise<void> {
    let conversationData = this.conversationData.getState(data.from);

    if (!conversationData) {
      conversationData = await this.getUserState(data.from);
    }

    if (conversationData.step === ConversationStep.SIGN_IN_GET_NAME) {
      conversationData.data = data.text;
    }

    const handlerFn = this.messageHandlers.messageHandlers[conversationData.step];
    await handlerFn({
      data,
      conversationData,
      sendTextMessage: (phoneNumberId, to, text, previewUrl) =>
        this.sendTextMessage(phoneNumberId, to, text, previewUrl),
      setState: (userKey, newState) => this.conversationData.setState(userKey, newState),
    });
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
