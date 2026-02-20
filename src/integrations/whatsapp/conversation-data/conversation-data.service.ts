import { Injectable } from '@nestjs/common';
import type { ConversationData } from './conversation-data.types';

@Injectable()
export class ConversationDataService {
  private readonly states = new Map<string, ConversationData>();

  getState(userKey: string): ConversationData {
    return this.states.get(userKey);
  }

  setState(userKey: string, state: ConversationData): void {
    this.states.set(userKey, { ...state });
  }

  resetState(userKey: string): void {
    this.states.delete(userKey);
  }
}
