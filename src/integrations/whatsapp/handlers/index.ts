import { Injectable } from '@nestjs/common';
import {
  CloseMenuLabels,
  CloseMenuOption,
  ConversationData,
  ConversationDataUpdate,
  ConversationStep,
  FullMenuLabels,
  FullMenuOption,
  MoreMenuLabels,
  MoreMenuOption,
  RescheduleContext,
  ScheduleConfirmLabels,
  ScheduleConfirmOption,
  ScheduleMenuLabels,
  ScheduleMenuOption,
  SCHEDULE_LIST_BACK_ID,
  CANCEL_ALL_ID,
  SignInConfirmOption,
} from '../conversation-data';
import { IncomingMessageParsed } from '../dto/whatsapp-webhook.dto';
import { log } from '@/common/logger';
import { UserService } from '@/modules/user/user.service';
import { AppointmentService, toSlotListItems } from '@/modules/appointment/appointment.service';
import { toTitleCase } from '@/common/helpers/title-case';
import { parseDayInput, parseDirectScheduleInput } from '@/common/helpers/parse-direct-schedule';
import { formatBrazil } from '@/common/helpers/brazil-date';

/** Profissional padrão enquanto o MVP não tem seleção de barbeiro. */
const DEFAULT_WORKER_ID = 1;

/** Link da agenda pública — hardcoded por enquanto (mover para config depois). */
const PUBLIC_AGENDA_URL = 'https://calendar.google.com/calendar/u/0/r';

const WEEKDAY_LABELS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

export type MessageHandlerPayload = {
  data: IncomingMessageParsed;
  conversationData: ConversationData;
  setState: (userKey: string, update: ConversationDataUpdate) => void;
  resetState: (userKey: string) => void;
  sendMessage: (
    type: 'text' | 'button' | 'list',
    text: string,
    options?: Array<{ id: string; title: string }>,
  ) => Promise<void>;
  callHandler: (step: ConversationStep) => Promise<void>;
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
    [ConversationStep.SIGN_IN_CONFIRM]: (h) => this.handleSignInConfirm(h),
    [ConversationStep.CHECK_APT]: (h) => this.handleCheckApt(h),
    [ConversationStep.FULL_MENU]: (h) => this.handleFullMenu(h),
    [ConversationStep.FULL_MENU_REPLY]: (h) => this.handleFullMenuReply(h),
    [ConversationStep.MORE_MENU]: (h) => this.handleMoreMenu(h),
    [ConversationStep.MORE_MENU_REPLY]: (h) => this.handleMoreMenuReply(h),
    [ConversationStep.CANCEL_MANY]: (h) => this.handleCancelMany(h),
    [ConversationStep.CANCEL_CONFIRM]: (h) => this.handleCancelConfirm(h),
    [ConversationStep.CANCEL_CONFIRM_ALL]: (h) => this.handleCancelConfirmAll(h),
    [ConversationStep.RESCHEDULE_MANY]: (h) => this.handleRescheduleMany(h),
    [ConversationStep.RESCHEDULE_CONFIRM]: (h) => this.handleRescheduleConfirm(h),
    [ConversationStep.SCHEDULE_MENU]: (h) => this.handleScheduleMenu(h),
    [ConversationStep.SCHEDULE_MENU_REPLY]: (h) => this.handleScheduleMenuReply(h),
    [ConversationStep.SCHEDULE_BY_DAY]: (h) => this.handleScheduleByDay(h),
    [ConversationStep.SCHEDULE_BY_DAY_LIST]: (h) => this.handleScheduleByDayList(h),
    [ConversationStep.SCHEDULE_NEXT_AVAILABLE_LIST]: (h) => this.handleScheduleNextAvailableList(h),
    [ConversationStep.SCHEDULE_BY_DAY_HOUR_UNAVAILABLE]: (h) =>
      this.handleScheduleByDayHourUnavailable(h),
    [ConversationStep.SCHEDULE_CHECK_AVAILABILITY]: (h) => this.handleScheduleCheckAvailability(h),
    [ConversationStep.SCHEDULE_CONFIRM]: (h) => this.handleScheduleConfirm(h),
    [ConversationStep.SCHEDULE_CONFIRMED]: (h) => this.handleScheduleConfirmed(h),
    [ConversationStep.CLOSE]: (h) => this.handleClose(h),
  };

  async handleSignIn(handler: MessageHandlerPayload): Promise<void> {
    await handler.sendMessage(
      'text',
      `👋 Olá! Verifiquei que você ainda não está cadastrado. Vamos fazer um cadastro rápido — assim conseguimos te reconhecer nos próximos agendamentos.\n\nVou te pedir apenas duas informações. 📝\nPara começar, qual é o seu *nome completo*?`,
    );
    handler.setState(handler.data.from, { step: ConversationStep.SIGN_IN_GET_NAME, data: null });
  }

  async handleSignInGetName(handler: MessageHandlerPayload): Promise<void> {
    const name = handler.data.text?.trim() ?? '';
    await handler.sendMessage('text', `Agora, qual é o seu *email*? 📧`);
    handler.setState(handler.data.from, {
      step: ConversationStep.SIGN_IN_GET_EMAIL,
      data: toTitleCase(name),
    });
  }

  async handleSignInGetEmail(handler: MessageHandlerPayload): Promise<void> {
    const name = handler.conversationData.data ?? '';
    const email = handler.data.text?.trim() ?? '';

    await handler.sendMessage(
      'button',
      `Confirme seus dados antes de finalizar o cadastro: 📋\n\n*Nome:* ${name}\n*Email:* ${email}`,
      [
        { id: SignInConfirmOption.CONFIRM, title: '✅ Confirmar' },
        { id: SignInConfirmOption.RETRY, title: '✏️ Corrigir' },
      ],
    );

    handler.setState(handler.data.from, {
      step: ConversationStep.SIGN_IN_CONFIRM,
      data: JSON.stringify({ name, email }),
    });
  }

  async handleSignInConfirm(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === SignInConfirmOption.RETRY) {
      await handler.sendMessage(
        'text',
        'Sem problemas! Vamos tentar novamente. 🔄\n\nQual é o seu *nome completo*?',
      );

      handler.setState(handler.data.from, {
        step: ConversationStep.SIGN_IN_GET_NAME,
        data: null,
      });

      return;
    }

    const { name, email } = JSON.parse(handler.conversationData.data ?? '{}') as {
      name: string;
      email: string;
    };
    const user = await this.userService.create({ name, email, phone: handler.data.from });

    await handler.sendMessage(
      'text',
      '🎉 Cadastro concluído! Vamos ao seu agendamento.',
    );

    handler.setState(handler.data.from, {
      step: ConversationStep.SCHEDULE_MENU,
      data: null,
      userId: user.id,
    });

    await handler.callHandler(ConversationStep.SCHEDULE_MENU);
  }

  async handleCheckApt(handler: MessageHandlerPayload): Promise<void> {
    const userId = handler.conversationData.userId;

    const appointments = await this.appointmentService.findManyByUserId(userId);

    const nextStep =
      appointments.length > 1 ? ConversationStep.FULL_MENU : ConversationStep.SCHEDULE_MENU;

    handler.setState(handler.data.from, { step: nextStep });

    await handler.callHandler(nextStep);
  }

  async handleFullMenu(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleFullMenu', { from: handler.data.from, step: handler.conversationData.step });

    await handler.sendMessage(
      'button',
      '💈 O que você gostaria de fazer?',
      Object.values(FullMenuOption).map((id) => ({ id, title: FullMenuLabels[id] })),
    );

    handler.setState(handler.data.from, { step: ConversationStep.FULL_MENU_REPLY });
  }

  async handleFullMenuReply(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleFullMenuReply', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text ?? '';

    switch (reply) {
      case FullMenuOption.LIST:
        await this.listAppointments(handler);
        return;
      case FullMenuOption.CANCEL:
        await this.startCancel(handler);
        return;
      case FullMenuOption.MORE:
        await this.transitionTo(handler, ConversationStep.MORE_MENU);
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, ConversationStep.FULL_MENU);
    }
  }

  async handleMoreMenu(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleMoreMenu', { from: handler.data.from, step: handler.conversationData.step });

    await handler.sendMessage(
      'button',
      '➕ Mais opções',
      Object.values(MoreMenuOption).map((id) => ({ id, title: MoreMenuLabels[id] })),
    );

    handler.setState(handler.data.from, { step: ConversationStep.MORE_MENU_REPLY });
  }

  async handleMoreMenuReply(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleMoreMenuReply', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text ?? '';

    switch (reply) {
      case MoreMenuOption.SCHEDULE:
        // agendamento novo: garante que não há contexto de remarcação ativo.
        handler.setState(handler.data.from, { context: null });
        await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
        return;
      case MoreMenuOption.RESCHEDULE:
        await this.startReschedule(handler);
        return;
      case MoreMenuOption.BACK:
        await this.transitionTo(handler, ConversationStep.FULL_MENU);
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, ConversationStep.MORE_MENU);
    }
  }

  /** Lista (somente leitura) os agendamentos do cliente e oferece Voltar/Encerrar. */
  private async listAppointments(handler: MessageHandlerPayload): Promise<void> {
    const userId = handler.conversationData.userId;
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    const appointments = await this.appointmentService.findManyByUserId(userId);

    if (appointments.length === 0) {
      await handler.sendMessage('text', '📭 Você não tem nenhum agendamento.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    const lines = appointments
      .map((apt, i) => `${i + 1}. 🗓️ *${this.formatSlotLabel(apt.datetime.toISOString())}*`)
      .join('\n');

    await handler.sendMessage('button', `📋 Seus agendamentos:\n\n${lines}`, [
      { id: CloseMenuOption.BACK, title: CloseMenuLabels[CloseMenuOption.BACK] },
      { id: CloseMenuOption.END, title: CloseMenuLabels[CloseMenuOption.END] },
    ]);

    handler.setState(handler.data.from, { step: ConversationStep.CLOSE, data: null });
  }

  /**
   * Entrada do "cancelar": verifica a quantidade de agendamentos.
   * - 1 agendamento: vai direto para a confirmação.
   * - 1+ agendamentos: lista para escolher qual cancelar (ou "Cancelar todos").
   */
  private async startCancel(handler: MessageHandlerPayload): Promise<void> {
    const userId = handler.conversationData.userId;
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    const appointments = await this.appointmentService.findManyByUserId(userId);

    if (appointments.length === 0) {
      await handler.sendMessage('text', '📭 Você não tem nenhum agendamento para cancelar.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    if (appointments.length === 1) {
      const apt = appointments[0];
      await this.promptCancelConfirm(handler, apt.id, apt.datetime.toISOString());
      return;
    }

    await handler.sendMessage('list', '🗑️ Selecione o agendamento que deseja cancelar', [
      ...appointments.map((apt) => ({
        id: String(apt.id),
        title: this.formatSlotLabel(apt.datetime.toISOString()),
      })),
      { id: CANCEL_ALL_ID, title: '❌ Cancelar todos' },
    ]);

    handler.setState(handler.data.from, { step: ConversationStep.CANCEL_MANY });
  }

  async handleCancelMany(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelMany', { from: handler.data.from, step: handler.conversationData.step });

    const reply = handler.data.text ?? '';

    if (reply === CANCEL_ALL_ID) {
      await handler.sendMessage('button', '⚠️ Deseja realmente cancelar *todos* os seus agendamentos?', [
        {
          id: ScheduleConfirmOption.CONFIRM,
          title: ScheduleConfirmLabels[ScheduleConfirmOption.CONFIRM],
        },
        {
          id: ScheduleConfirmOption.DECLINE,
          title: ScheduleConfirmLabels[ScheduleConfirmOption.DECLINE],
        },
      ]);
      handler.setState(handler.data.from, { step: ConversationStep.CANCEL_CONFIRM_ALL });
      return;
    }

    const appointmentId = Number(reply);
    if (!appointmentId || Number.isNaN(appointmentId)) {
      await handler.sendMessage('text', '⚠️ Seleção inválida. Escolha um agendamento da lista.');
      return;
    }

    let appointment: Awaited<ReturnType<AppointmentService['findUnique']>>;
    try {
      appointment = await this.appointmentService.findUnique(appointmentId);
    } catch {
      await handler.sendMessage('text', '🔍 Agendamento não encontrado. Escolha um da lista.');
      return;
    }

    await this.promptCancelConfirm(handler, appointment.id, appointment.datetime.toISOString());
  }

  async handleCancelConfirm(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelConfirm', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text ?? '';

    if (reply === ScheduleConfirmOption.DECLINE) {
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    const appointmentId = Number(handler.conversationData.data);
    if (!appointmentId || Number.isNaN(appointmentId)) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao cancelar. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    try {
      await this.appointmentService.cancel(appointmentId);
    } catch (err) {
      log.error(
        'handleCancelConfirm: falha ao cancelar',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage('text', '😕 Não foi possível cancelar agora. Tente novamente.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    await this.promptCancelDone(handler, '✅ Seu agendamento foi cancelado.');
  }

  async handleCancelConfirmAll(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelConfirmAll', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text ?? '';

    if (reply === ScheduleConfirmOption.DECLINE) {
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    const userId = handler.conversationData.userId;
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao cancelar. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    try {
      await this.appointmentService.cancelAllByUserId(userId);
    } catch (err) {
      log.error(
        'handleCancelConfirmAll: falha ao cancelar todos',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage('text', '😕 Não foi possível cancelar agora. Tente novamente.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    await this.promptCancelDone(handler, '✅ Todos os seus agendamentos foram cancelados.');
  }

  /** Renderiza a confirmação de cancelamento de um agendamento e aguarda Sim/Não. */
  private async promptCancelConfirm(
    handler: MessageHandlerPayload,
    appointmentId: number,
    iso: string,
  ): Promise<void> {
    await handler.sendMessage(
      'button',
      `⚠️ Deseja realmente cancelar o seguinte agendamento?\n\n🗓️ *${this.formatSlotLabel(iso)}*`,
      [
        {
          id: ScheduleConfirmOption.CONFIRM,
          title: ScheduleConfirmLabels[ScheduleConfirmOption.CONFIRM],
        },
        {
          id: ScheduleConfirmOption.DECLINE,
          title: ScheduleConfirmLabels[ScheduleConfirmOption.DECLINE],
        },
      ],
    );

    handler.setState(handler.data.from, {
      step: ConversationStep.CANCEL_CONFIRM,
      data: String(appointmentId),
    });
  }

  /** Mensagem final de cancelamento com Voltar/Encerrar (cai no CLOSE). */
  private async promptCancelDone(handler: MessageHandlerPayload, message: string): Promise<void> {
    await handler.sendMessage('button', message, [
      { id: CloseMenuOption.BACK, title: CloseMenuLabels[CloseMenuOption.BACK] },
      { id: CloseMenuOption.END, title: CloseMenuLabels[CloseMenuOption.END] },
    ]);

    handler.setState(handler.data.from, { step: ConversationStep.CLOSE, data: null });
  }

  /**
   * Entrada do "remarcar": verifica a quantidade de agendamentos.
   * - 1 agendamento: já fixa o contexto e cai no fluxo de escolha de novo horário.
   * - 1+ agendamentos: lista para o cliente escolher qual remarcar.
   */
  private async startReschedule(handler: MessageHandlerPayload): Promise<void> {
    const userId = handler.conversationData.userId;
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    const appointments = await this.appointmentService.findManyByUserId(userId);

    if (appointments.length === 0) {
      await handler.sendMessage('text', '📭 Você não tem nenhum agendamento para remarcar.');
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    if (appointments.length === 1) {
      const apt = appointments[0];
      this.setRescheduleContext(handler, apt.id, apt.datetime.toISOString());
      await handler.sendMessage(
        'text',
        `🔄 Vamos remarcar seu agendamento de *${this.formatSlotLabel(apt.datetime.toISOString())}*.`,
      );
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    await handler.sendMessage(
      'list',
      '🔄 Escolha um horário para remarcar',
      appointments.map((apt) => ({
        id: String(apt.id),
        title: this.formatSlotLabel(apt.datetime.toISOString()),
      })),
    );

    handler.setState(handler.data.from, { step: ConversationStep.RESCHEDULE_MANY });
  }

  async handleRescheduleMany(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleRescheduleMany', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const appointmentId = Number(handler.data.text);
    if (!appointmentId || Number.isNaN(appointmentId)) {
      await handler.sendMessage('text', '⚠️ Seleção inválida. Escolha um agendamento da lista.');
      return;
    }

    let appointment: Awaited<ReturnType<AppointmentService['findUnique']>>;
    try {
      appointment = await this.appointmentService.findUnique(appointmentId);
    } catch {
      await handler.sendMessage('text', '🔍 Agendamento não encontrado. Escolha um da lista.');
      return;
    }

    this.setRescheduleContext(handler, appointment.id, appointment.datetime.toISOString());
    await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
  }

  async handleRescheduleConfirm(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleRescheduleConfirm', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text ?? '';
    const context = this.getRescheduleContext(handler);
    const newIso = handler.conversationData.data;

    if (reply === ScheduleConfirmOption.DECLINE) {
      handler.setState(handler.data.from, { context: null });
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    if (!context || !newIso) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao remarcar. Vamos recomeçar.');
      handler.setState(handler.data.from, { context: null });
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    try {
      await this.appointmentService.reschedule(context.appointmentId, newIso);
    } catch (err) {
      log.error(
        'handleRescheduleConfirm: falha ao remarcar',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage(
        'text',
        '😕 Não foi possível remarcar — esse horário pode ter sido ocupado. Vamos tentar de novo.',
      );
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    await handler.sendMessage(
      'button',
      `✅ Seu agendamento foi remarcado de *${this.formatSlotLabel(context.oldIso)}* para *${this.formatSlotLabel(newIso)}*.`,
      [
        { id: CloseMenuOption.BACK, title: CloseMenuLabels[CloseMenuOption.BACK] },
        { id: CloseMenuOption.END, title: CloseMenuLabels[CloseMenuOption.END] },
      ],
    );

    handler.setState(handler.data.from, {
      step: ConversationStep.CLOSE,
      data: null,
      context: null,
    });
  }

  private setRescheduleContext(
    handler: MessageHandlerPayload,
    appointmentId: number,
    oldIso: string,
  ): void {
    const context: RescheduleContext = { mode: 'reschedule', appointmentId, oldIso };
    handler.setState(handler.data.from, { context: JSON.stringify(context) });
  }

  private getRescheduleContext(handler: MessageHandlerPayload): RescheduleContext | null {
    const raw = handler.conversationData.context;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as RescheduleContext;
      return parsed.mode === 'reschedule' ? parsed : null;
    } catch {
      return null;
    }
  }

  async handleScheduleMenu(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleMenu', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const intro = this.getRescheduleContext(handler)
      ? '🔄 Para qual horário deseja remarcar?'
      : '📅 Vamos agendar seu horário?';

    await handler.sendMessage(
      'button',
      `${intro}\n\n✍️ Se já tem um dia e horário em mente, é só digitar.\nExemplo: *05/02 15:00*\n\n🔗 Para visualizar a agenda, acesse o link abaixo e depois digite o dia e o horário desejados:\n${PUBLIC_AGENDA_URL}\n\n👇 Caso prefira buscar de outra forma, use os botões abaixo.`,
      Object.values(ScheduleMenuOption).map((id) => ({ id, title: ScheduleMenuLabels[id] })),
    );

    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_MENU_REPLY });
  }

  async handleScheduleMenuReply(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleMenuReply', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text;

    if (!reply) {
      await handler.sendMessage(
        'text',
        '⚠️ Não entendi. Escolha uma opção do menu ou digite um dia e horário.\nExemplo: *05/02 15:00*',
      );
      return;
    }

    switch (reply) {
      case ScheduleMenuOption.BY_DAY:
        await this.transitionTo(handler, ConversationStep.SCHEDULE_BY_DAY);
        return;
      case ScheduleMenuOption.NEXT_APPOINTMENTS:
        await this.transitionTo(handler, ConversationStep.SCHEDULE_NEXT_AVAILABLE_LIST);
        return;
    }

    const parsed = parseDirectScheduleInput(reply);
    if (parsed) {
      await this.transitionTo(handler, ConversationStep.SCHEDULE_CHECK_AVAILABILITY, parsed.iso);
      return;
    }

    log.warn('handleScheduleMenuReply: reply inválido', { from: handler.data.from, reply });
    await handler.sendMessage(
      'text',
      '⚠️ Formato inválido. Por favor, informe o horário no formato correto.\nExemplo: *05/02 15:00*',
    );
  }

  private async transitionTo(
    handler: MessageHandlerPayload,
    step: ConversationStep,
    data?: string,
  ): Promise<void> {
    handler.setState(handler.data.from, data !== undefined ? { step, data } : { step });
    await handler.callHandler(step);
  }

  /** true se a data estiver além da janela de agendamento permitida ao cliente. */
  private isBeyondBookingWindow(date: Date): boolean {
    return date.getTime() >= this.appointmentService.getBookingWindow().endExclusive.getTime();
  }

  /** Mensagem padrão quando o cliente tenta agendar além da janela permitida. */
  private bookingLimitMessage(): string {
    const { lastDay } = this.appointmentService.getBookingWindow();
    const [, mm, dd] = formatBrazil(lastDay).slice(0, 10).split('-');
    return `😕 Só é possível agendar até *${dd}/${mm}*.\nEscolha uma data dentro desse período.`;
  }

  async handleScheduleByDay(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDay', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    await handler.sendMessage('text', '🗓️ Digite o dia que deseja agendar.\n\nExemplo: *05/02*');

    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_BY_DAY_LIST });
  }

  async handleScheduleByDayList(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDayList', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const day = parseDayInput(handler.data.text ?? '');
    if (!day) {
      await handler.sendMessage(
        'text',
        '⚠️ Formato inválido. Informe o dia no formato *DD/MM*.\nExemplo: *05/02*',
      );
      return;
    }

    if (this.isBeyondBookingWindow(day)) {
      await handler.sendMessage('text', this.bookingLimitMessage());
      return;
    }

    // limita a 9 horários para sobrar espaço para a linha "Voltar" (máx. 10 itens na lista).
    const days = await this.appointmentService.getAvailableSlotsForDay(DEFAULT_WORKER_ID, day, 9);
    const slots = toSlotListItems(days);
    const [, mm, dd] = formatBrazil(day).slice(0, 10).split('-');

    if (slots.length === 0) {
      await handler.sendMessage(
        'text',
        `😕 Não há horários disponíveis no dia ${dd}/${mm}.\nTente outro dia.`,
      );
      return;
    }

    await handler.sendMessage('list', `⏰ Aqui estão os horários disponíveis do dia ${dd}/${mm}`, [
      ...slots,
      { id: SCHEDULE_LIST_BACK_ID, title: '↩️ Voltar' },
    ]);

    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_CONFIRM });
  }

  async handleScheduleNextAvailableList(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleNextAvailableList', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    // limita a 9 horários para sobrar espaço para a linha "Outras opções" (máx. 10 itens na lista).
    const days = await this.appointmentService.getNextAvailableSlots(DEFAULT_WORKER_ID, 9);
    const slots = toSlotListItems(days);

    if (slots.length === 0) {
      await handler.sendMessage(
        'text',
        '😕 Não há horários disponíveis nos próximos dias. Tente novamente mais tarde.',
      );
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    await handler.sendMessage(
      'list',
      '⏰ Aqui estão os próximos horários disponíveis. Selecione um para agendar ou escolha outra opção.',
      [...slots, { id: SCHEDULE_LIST_BACK_ID, title: '🔧 Outras opções' }],
    );

    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_CONFIRM });
  }

  async handleScheduleByDayHourUnavailable(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDayHourUnavailable', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const iso = handler.conversationData.data;
    if (!iso || Number.isNaN(new Date(iso).getTime())) {
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    const day = new Date(iso);
    const days = await this.appointmentService.getAvailableSlotsForDay(DEFAULT_WORKER_ID, day, 9);
    const slots = toSlotListItems(days);
    const [, mm, dd] = formatBrazil(day).slice(0, 10).split('-');

    if (slots.length === 0) {
      await handler.sendMessage(
        'text',
        `😕 O horário escolhido não está disponível e não há outros horários livres no dia ${dd}/${mm}.\nTente outro dia.`,
      );
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    await handler.sendMessage(
      'list',
      '⚠️ O dia/horário selecionado não está disponível. Aqui estão os horários livres mais próximos do que você queria:',
      [...slots, { id: SCHEDULE_LIST_BACK_ID, title: '↩️ Voltar' }],
    );

    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_CONFIRM });
  }

  async handleScheduleCheckAvailability(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleCheckAvailability', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const iso = handler.conversationData.data;
    if (!iso || Number.isNaN(new Date(iso).getTime())) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao validar o horário. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    if (this.isBeyondBookingWindow(new Date(iso))) {
      await handler.sendMessage('text', this.bookingLimitMessage());
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    const requestedTime = new Date(iso).getTime();
    const days = await this.appointmentService.getAvailableSlotsForDay(
      DEFAULT_WORKER_ID,
      new Date(iso),
    );
    const available = toSlotListItems(days).some(
      (slot) => new Date(slot.id).getTime() === requestedTime,
    );

    if (available) {
      await this.promptScheduleConfirm(handler, iso);
      return;
    }

    await this.transitionTo(handler, ConversationStep.SCHEDULE_BY_DAY_HOUR_UNAVAILABLE);
  }

  async handleScheduleConfirm(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleConfirm', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text ?? '';

    if (reply === SCHEDULE_LIST_BACK_ID) {
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    // reply é o id da linha selecionada = horário ISO (ex: 2026-02-05T15:00:00-03:00).
    if (!reply || Number.isNaN(new Date(reply).getTime())) {
      await handler.sendMessage('text', '⚠️ Seleção inválida. Por favor, escolha um horário da lista.');
      return;
    }

    await this.promptScheduleConfirm(handler, reply);
  }

  /**
   * Renderiza a pergunta de confirmação para um horário ISO e aguarda Sim/Não.
   * Em modo remarcar (contexto ativo), pergunta a remarcação e direciona ao
   * RESCHEDULE_CONFIRM; caso contrário, ao SCHEDULE_CONFIRMED (agendamento novo).
   */
  private async promptScheduleConfirm(handler: MessageHandlerPayload, iso: string): Promise<void> {
    const buttons = [
      {
        id: ScheduleConfirmOption.CONFIRM,
        title: ScheduleConfirmLabels[ScheduleConfirmOption.CONFIRM],
      },
      {
        id: ScheduleConfirmOption.DECLINE,
        title: ScheduleConfirmLabels[ScheduleConfirmOption.DECLINE],
      },
    ];

    const context = this.getRescheduleContext(handler);

    if (context) {
      await handler.sendMessage(
        'button',
        `🔄 Confirma a remarcação de *${this.formatSlotLabel(context.oldIso)}* para *${this.formatSlotLabel(iso)}*?`,
        buttons,
      );
      handler.setState(handler.data.from, { step: ConversationStep.RESCHEDULE_CONFIRM, data: iso });
      return;
    }

    await handler.sendMessage(
      'button',
      `📅 Confirma o agendamento para *${this.formatSlotLabel(iso)}*?`,
      buttons,
    );
    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_CONFIRMED, data: iso });
  }

  async handleScheduleConfirmed(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleConfirmed', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text ?? '';

    if (reply === ScheduleConfirmOption.DECLINE) {
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    const iso = handler.conversationData.data;
    const userId = handler.conversationData.userId;

    if (!iso || !userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar o agendamento.');
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    try {
      await this.appointmentService.create({
        userId,
        workerId: DEFAULT_WORKER_ID,
        datetime: iso,
      } as Parameters<AppointmentService['create']>[0]);
    } catch (err) {
      log.error(
        'handleScheduleConfirmed: falha ao criar agendamento',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage(
        'text',
        '😕 Não foi possível concluir o agendamento — esse horário pode ter sido ocupado. Vamos tentar de novo.',
      );
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    const name = (await this.userService.getNameById(userId)) ?? '';

    await handler.sendMessage(
      'button',
      `✅ Agendamento confirmado!\n\n👤 *Cliente:* ${name}\n🗓️ *Data:* ${this.formatSlotLabel(iso)}\n\nAté lá! 💈`,
      [
        { id: CloseMenuOption.BACK, title: CloseMenuLabels[CloseMenuOption.BACK] },
        { id: CloseMenuOption.END, title: CloseMenuLabels[CloseMenuOption.END] },
      ],
    );

    handler.setState(handler.data.from, { step: ConversationStep.CLOSE, data: null });
  }

  async handleClose(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleClose', { from: handler.data.from, step: handler.conversationData.step });

    const reply = handler.data.text ?? '';

    if (reply === CloseMenuOption.BACK) {
      await this.transitionTo(handler, ConversationStep.FULL_MENU);
      return;
    }

    await handler.sendMessage('text', 'Atendimento encerrado. Quando precisar, é só chamar! 👋');
    handler.resetState(handler.data.from);
  }

  /** Formata um horário ISO para exibição: "quinta-feira, 05/02 às 15:00". */
  private formatSlotLabel(iso: string): string {
    const date = new Date(iso);
    const [datePart, timePart] = formatBrazil(date).split('T');
    const [, mm, dd] = datePart.split('-');
    const weekdayIdx = new Date(date.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
    return `${WEEKDAY_LABELS[weekdayIdx]}, ${dd}/${mm} às ${timePart.slice(0, 5)}`;
  }
}
