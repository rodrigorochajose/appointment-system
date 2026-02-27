import { Injectable } from '@nestjs/common';
import { ConversationStep } from './conversation-data.types';
import type { ConversationData, ConversationDataUpdate } from './conversation-data.types';

@Injectable()
export class ConversationDataService {
  private readonly states = new Map<string, ConversationData>();

  getState(userKey: string): ConversationData {
    return this.states.get(userKey);
  }

  setState(userKey: string, update: ConversationDataUpdate): void {
    const current = this.states.get(userKey);
    const next: ConversationData = {
      step: update.step ?? current?.step ?? ConversationStep.SIGN_IN,
      data: update.data !== undefined ? update.data : (current?.data ?? null),
      userId: update.userId !== undefined ? update.userId : (current?.userId ?? null),
    };
    this.states.set(userKey, next);
  }

  resetState(userKey: string): void {
    this.states.delete(userKey);
  }
}
