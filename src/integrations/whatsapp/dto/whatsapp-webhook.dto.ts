/**
 * Tipos para o webhook da WhatsApp Cloud API.
 * Payload pode vir com messages (mensagem recebida) ou statuses (status de mensagem enviada).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

export interface WhatsAppWebhookMessageText {
  body: string;
}

export interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: WhatsAppWebhookMessageText;
  /** Outros tipos (image, audio, etc.) têm estruturas próprias. */
  [key: string]: unknown;
}

export interface WhatsAppWebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read';
  timestamp: string;
  recipient_id: string;
  [key: string]: unknown;
}

export interface WhatsAppWebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: WhatsAppWebhookMessage[];
  statuses?: WhatsAppWebhookStatus[];
  errors?: unknown[];
}

export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookValue;
  field: string;
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: WhatsAppWebhookEntry[];
}

export interface IncomingMessageParsed {
  phoneNumberId: string;
  from: string;
  text?: string;
}
