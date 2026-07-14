import { Injectable } from '@nestjs/common';
import { ConversationStep } from './conversation-data.types';
import type { ConversationData, ConversationDataUpdate } from './conversation-data.types';

/**
 * Tempo máximo de inatividade de uma conversa antes de ela ser descartada.
 * Ao expirar, `getState` devolve `undefined` e o próximo webhook do mesmo
 * telefone recomeça o fluxo do zero (caminho `!conversationData` em
 * whatsapp.service). Expiração é preguiçosa (checada na leitura): sem timer/cron.
 */
const CONVERSATION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ConversationDataService {
  private readonly states = new Map<string, ConversationData>();
  /** Instante (epoch ms) da última escrita de cada conversa, para o TTL. */
  private readonly lastActivity = new Map<string, number>();

  getState(userKey: string): ConversationData {
    const state = this.states.get(userKey);
    if (!state) return undefined;

    const last = this.lastActivity.get(userKey) ?? 0;
    if (Date.now() - last > CONVERSATION_TTL_MS) {
      this.resetState(userKey);
      return undefined;
    }

    return state;
  }

  setState(userKey: string, update: ConversationDataUpdate): void {
    const current = this.states.get(userKey);
    const next: ConversationData = {
      step: update.step ?? current?.step ?? ConversationStep.SIGN_IN,
      data: update.data !== undefined ? update.data : (current?.data ?? null),
      userId: update.userId !== undefined ? update.userId : (current?.userId ?? null),
      role: update.role !== undefined ? update.role : (current?.role ?? 'user'),
      workerId: update.workerId !== undefined ? update.workerId : (current?.workerId ?? null),
      context: update.context !== undefined ? update.context : (current?.context ?? null),
    };
    this.states.set(userKey, next);
    this.lastActivity.set(userKey, Date.now());
  }

  resetState(userKey: string): void {
    this.states.delete(userKey);
    this.lastActivity.delete(userKey);
  }
}
