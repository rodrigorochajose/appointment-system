import { Injectable } from '@nestjs/common';
import type { ConversationState } from './conversation-state.types';

@Injectable()
export class ConversationStateService {
  private readonly states = new Map<string, ConversationState>();

  getState(userKey: string): ConversationState {
    return this.states.get(userKey);
  }

  setState(userKey: string, state: ConversationState): void {
    this.states.set(userKey, { ...state });
  }

  resetState(userKey: string): void {
    this.states.delete(userKey);
  }
}
