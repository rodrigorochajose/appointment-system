import { Injectable } from '@nestjs/common';
import { ConversationData, ConversationDataUpdate, ConversationStep } from '../conversation-data';
import { IncomingMessageParsed } from '../dto/whatsapp-webhook.dto';
import { log } from '@/common/logger';
import { UserService } from '@/modules/user/user.service';
import { AppointmentService } from '@/modules/appointment/appointment.service';

export type MessageHandlerPayload = {
  data: IncomingMessageParsed;
  conversationData: ConversationData;
  setState: (userKey: string, update: ConversationDataUpdate) => void;
  sendMessage: (
    type: 'text' | 'button' | 'list',
    text: string,
    options?: Array<{ id: string; title: string }>,
  ) => Promise<void>;
};

@Injectable()
export class WhatsAppMessageHandlers {
  constructor(
    private readonly userService: UserService,
    private readonly appointmentService: AppointmentService,
  ) {}

  public readonly messageHandlers: Record<
    ConversationStep,
    (handler: MessageHandlerPayload) => Promise<void>
  > = {
    [ConversationStep.SIGN_IN]: (h) => this.handleSignIn(h),
    [ConversationStep.SIGN_IN_GET_NAME]: (h) => this.handleSignInGetName(h),
    [ConversationStep.SIGN_IN_GET_EMAIL]: (h) => this.handleSignInGetEmail(h),
    [ConversationStep.CHECK_APT]: (h) => this.handleCheckApt(h),
    [ConversationStep.FULL_MENU]: (h) => this.handleFullMenu(h),
    [ConversationStep.CANCEL_MANY]: (h) => this.handleCancelMany(h),
    [ConversationStep.CANCEL_CONFIRM]: (h) => this.handleCancelConfirm(h),
    [ConversationStep.CANCEL_CONFIRM_ALL]: (h) => this.handleCancelConfirmAll(h),
    [ConversationStep.CANCEL_CONFIRMED]: (h) => this.handleCancelConfirmed(h),
    [ConversationStep.RESCHEDULE_MANY]: (h) => this.handleRescheduleMany(h),
    [ConversationStep.RESCHEDULE_CONFIRM]: (h) => this.handleRescheduleConfirm(h),
    [ConversationStep.SCHEDULE_MENU]: (h) => this.handleScheduleMenu(h),
    [ConversationStep.SCHEDULE_BY_DAY]: (h) => this.handleScheduleByDay(h),
    [ConversationStep.SCHEDULE_BY_DAY_LIST]: (h) => this.handleScheduleByDayList(h),
    [ConversationStep.SCHEDULE_NEXT_AVAILABLE_LIST]: (h) => this.handleScheduleNextAvailableList(h),
    [ConversationStep.SCHEDULE_BY_DAY_HOUR]: (h) => this.handleScheduleByDayHour(h),
    [ConversationStep.SCHEDULE_BY_DAY_HOUR_UNAVAILABLE]: (h) =>
      this.handleScheduleByDayHourUnavailable(h),
    [ConversationStep.SCHEDULE_CONFIRM]: (h) => this.handleScheduleConfirm(h),
    [ConversationStep.SCHEDULE_CONFIRMED]: (h) => this.handleScheduleConfirmed(h),
    [ConversationStep.CLOSE]: (h) => this.handleClose(h),
  };

  async handleSignIn(handler: MessageHandlerPayload): Promise<void> {
    await handler.sendMessage(
      'text',
      `Olá! Verifiquei que você ainda não está cadastrado. Vamos fazer um breve cadastro para que possa ser identificado em futuros agendamentos\n\n
      Vou te pedir apenas duas informações.\n\n
      Primeiro me informe seu nome completo.`,
    );
    handler.setState(handler.data.from, { step: ConversationStep.SIGN_IN_GET_NAME, data: null });
  }

  async handleSignInGetName(handler: MessageHandlerPayload): Promise<void> {
    const name = handler.data.text?.trim() ?? '';
    await handler.sendMessage('text', `Agora me informe seu email.`);
    handler.setState(handler.data.from, { step: ConversationStep.SIGN_IN_GET_EMAIL, data: name });
  }

  async handleSignInGetEmail(handler: MessageHandlerPayload): Promise<void> {
    const name = handler.conversationData.data ?? '';
    const email = handler.data.text?.trim() ?? '';
    const user = await this.userService.create({ name, email, phone: handler.data.from });
    await handler.sendMessage('text', 'Cadastro concluído! A partir de agora você pode agendar pelo menu.');
    handler.setState(handler.data.from, {
      step: ConversationStep.FULL_MENU,
      data: null,
      userId: user.id,
    });
  }

  async handleCheckApt(handler: MessageHandlerPayload): Promise<void> {
    const userId = handler.conversationData.userId;

    const appointments = await this.appointmentService.findManyByUserId(userId);

    const nextStep =
      appointments.length > 1 ? ConversationStep.FULL_MENU : ConversationStep.SCHEDULE_MENU;

    handler.setState(handler.data.from, { step: nextStep });
    return;
  }

  async handleFullMenu(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleFullMenu', { from: handler.data.from, step: handler.conversationData.step });
  }

  async handleCancelMany(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelMany', { from: handler.data.from, step: handler.conversationData.step });
  }

  async handleCancelConfirm(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelConfirm', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleCancelConfirmAll(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelConfirmAll', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleCancelConfirmed(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelConfirmed', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleRescheduleMany(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleRescheduleMany', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleRescheduleConfirm(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleRescheduleConfirm', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleMenu(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleMenu', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleByDay(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDay', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleByDayList(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDayList', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleNextAvailableList(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleNextAvailableList', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleByDayHour(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDayHour', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleByDayHourUnavailable(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDayHourUnavailable', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleConfirm(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleConfirm', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleScheduleConfirmed(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleConfirmed', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });
  }

  async handleClose(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleClose', { from: handler.data.from, step: handler.conversationData.step });
  }
}
