import { Injectable } from '@nestjs/common';
import type {
  WhatsAppWebhookPayload,
  WhatsAppWebhookEntry,
  IncomingMessageParsed,
} from './dto/whatsapp-webhook.dto';
import { UserService } from 'src/modules/user/user.service';
import { ConversationStep, ConversationData, ListConfig } from './conversation-data';
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
      log.error('Something is missing');
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
            text: msg.text?.body ?? msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,
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

  async getUserState(data: IncomingMessageParsed): Promise<ConversationData> {
    const user = await this.userService.findByPhone(data.from);

    if (!user) {
      this.conversationData.setState(data.from, {
        step: ConversationStep.SIGN_IN,
        data: null,
        userId: null,
        role: 'user',
        workerId: null,
      });
      return this.conversationData.getState(data.from);
    }

    // Barbeiro: identidade (telefone) vinculada a um profissional → menu do worker.
    if (user.workerId) {
      this.conversationData.setState(data.from, {
        step: ConversationStep.WORKER_MENU,
        data: null,
        userId: user.id,
        role: 'worker',
        workerId: user.workerId,
      });
      return this.conversationData.getState(data.from);
    }

    const userHasApt = await this.appointmentService.findManyByUserId(user.id);

    const userStep =
      userHasApt.length > 0 ? ConversationStep.FULL_MENU : ConversationStep.SCHEDULE_MENU;

    await this.buildMessageBodyAndSend(
      data.phoneNumberId,
      data.from,
      'text',
      `Olá ${user.name}.\nÉ um prazer te ver por aqui novamente`,
      [],
    );

    this.conversationData.setState(data.from, {
      step: userStep,
      data: null,
      userId: user.id,
      role: 'user',
      workerId: null,
    });

    return this.conversationData.getState(data.from);
  }

  async handleMessage(data: IncomingMessageParsed): Promise<void> {
    let conversationData = this.conversationData.getState(data.from);

    if (!conversationData) {
      conversationData = await this.getUserState(data);
    }

    if (conversationData.step === ConversationStep.SIGN_IN_GET_NAME) {
      conversationData.data = data.text;
    }

    await this.executeHandler(conversationData.step, data);
  }

  private async executeHandler(step: ConversationStep, data: IncomingMessageParsed): Promise<void> {
    const conversationData = this.conversationData.getState(data.from);
    const handlerFn = this.messageHandlers.messageHandlers[step];
    await handlerFn({
      data,
      conversationData,
      setState: (userKey, newState) => this.conversationData.setState(userKey, newState),
      resetState: (userKey) => this.conversationData.resetState(userKey),
      sendMessage: (type, text, options, listConfig) =>
        this.buildMessageBodyAndSend(
          data.phoneNumberId,
          data.from,
          type,
          text,
          options ?? [],
          false,
          listConfig,
        ),
      callHandler: (nextStep) => this.executeHandler(nextStep, data),
    });
  }

  async sendMessage(phoneNumberId: string, body: unknown): Promise<void> {
    const token = process.env.WPP_TOKEN;
    if (!token) {
      throw new Error('WPP_TOKEN não configurado. Defina no .env para enviar mensagens.');
    }

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

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
  }

  buildMessageBody(
    to: string,
    type: 'text' | 'button' | 'list',
    text: string,
    options: Array<{ id: string; title: string }>,
    previewUrl = false,
    listConfig?: ListConfig,
  ) {
    const normalizedTo = to.replace(/\D/g, '');

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
    };

    switch (type) {
      case 'text':
        return {
          ...body,
          type: 'text',
          text: {
            body: text.slice(0, 4096),
            ...(previewUrl && { preview_url: true }),
          },
        };
      case 'button':
        return {
          ...body,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text,
            },
            action: {
              buttons: options.map((option) => ({
                type: 'reply',
                reply: {
                  id: option.id,
                  title: option.title,
                },
              })),
            },
          },
        };
      case 'list':
        return {
          ...body,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: {
              text,
            },
            header: {
              type: 'text',
              text: listConfig?.header ?? 'Escolha um horário',
            },
            footer: {
              text: '',
            },
            action: {
              button: listConfig?.button ?? 'Visualizar horários',
              sections: [
                {
                  title: listConfig?.sectionTitle ?? 'Horários disponíveis',
                  rows: options.map((option) => ({
                    id: option.id,
                    title: option.title,
                    description: '',
                  })),
                },
              ],
            },
          },
        };
    }

    throw new Error(`Tipo de mensagem não suportado: ${type}`);
  }

  async buildMessageBodyAndSend(
    phoneNumberId: string,
    to: string,
    type: 'text' | 'button' | 'list',
    text: string,
    options: Array<{ id: string; title: string }>,
    previewUrl = false,
    listConfig?: ListConfig,
  ): Promise<void> {
    const body = this.buildMessageBody(to, type, text, options, previewUrl, listConfig);
    await this.sendMessage(phoneNumberId, body);
  }
}
