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
  WorkerMenuOption,
  WorkerMenuLabels,
  WorkerClientMenuOption,
  WorkerClientMenuLabels,
  WorkerShopMenuOption,
  WorkerShopMenuLabels,
  WORKER_HOURS_DAY_PREFIX,
  WORKER_HOURS_WEEKDAYS_ID,
  WORKER_FIX_DAY_PREFIX,
  WORKER_FIX_OTHER_TIME_ID,
  WorkerBookingMenuOption,
  WorkerBookingMenuLabels,
  ClientUpdateFieldOption,
  ClientUpdateFieldLabels,
  UnavailableScopeOption,
  UnavailableScopeLabels,
  WORKER_SEARCH_BACK_ID,
  BACK_ID,
  BACK_LABEL,
  WorkerSearchEmptyOption,
  WorkerSearchEmptyLabels,
  WorkerCreatedOption,
  WorkerCreatedLabels,
  WorkerAction,
  WorkerActionContext,
  ListConfig,
} from '../conversation-data';
import { IncomingMessageParsed } from '../dto/whatsapp-webhook.dto';
import { log } from '@/common/logger';
import { UserService } from '@/modules/user/user.service';
import { AppointmentService, toSlotListItems } from '@/modules/appointment/appointment.service';
import { ScheduleService } from '@/modules/schedule/schedule.service';
import { UnavailablePeriodService } from '@/modules/unavailable-period/unavailable-period.service';
import {
  WorkingHourService,
  WorkingHourWindow,
} from '@/modules/working-hour/working-hour.service';
import { toTitleCase } from '@/common/helpers/title-case';
import { parseDayInput, parseDirectScheduleInput } from '@/common/helpers/parse-direct-schedule';
import { formatBrazil, parseBrazilDateTime } from '@/common/helpers/brazil-date';

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

/** Rótulos curtos por weekday (0 = domingo), para o menu de horário de funcionamento. */
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Ordem de exibição dos dias: Seg→Dom (mais natural para o barbeiro). */
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type MessageHandlerPayload = {
  data: IncomingMessageParsed;
  conversationData: ConversationData;
  setState: (userKey: string, update: ConversationDataUpdate) => void;
  resetState: (userKey: string) => void;
  sendMessage: (
    type: 'text' | 'button' | 'list',
    text: string,
    options?: Array<{ id: string; title: string }>,
    listConfig?: ListConfig,
  ) => Promise<void>;
  callHandler: (step: ConversationStep) => Promise<void>;
};

@Injectable()
export class WhatsAppMessageHandlers {
  constructor(
    private readonly userService: UserService,
    private readonly appointmentService: AppointmentService,
    private readonly scheduleService: ScheduleService,
    private readonly unavailablePeriodService: UnavailablePeriodService,
    private readonly workingHourService: WorkingHourService,
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
    [ConversationStep.WORKER_MENU]: (h) => this.handleWorkerMenu(h),
    [ConversationStep.WORKER_MENU_REPLY]: (h) => this.handleWorkerMenuReply(h),
    [ConversationStep.WORKER_CLIENT_MENU]: (h) => this.handleWorkerClientMenu(h),
    [ConversationStep.WORKER_CLIENT_MENU_REPLY]: (h) => this.handleWorkerClientMenuReply(h),
    [ConversationStep.WORKER_SHOP_MENU]: (h) => this.handleWorkerShopMenu(h),
    [ConversationStep.WORKER_SHOP_MENU_REPLY]: (h) => this.handleWorkerShopMenuReply(h),
    [ConversationStep.WORKER_BOOKING_MENU]: (h) => this.handleWorkerBookingMenu(h),
    [ConversationStep.WORKER_BOOKING_MENU_REPLY]: (h) => this.handleWorkerBookingMenuReply(h),
    [ConversationStep.WORKER_CLIENT_SEARCH]: (h) => this.handleWorkerClientSearch(h),
    [ConversationStep.WORKER_CLIENT_SEARCH_RESULTS]: (h) => this.handleWorkerClientSearchResults(h),
    [ConversationStep.WORKER_CLIENT_SEARCH_PICK]: (h) => this.handleWorkerClientSearchPick(h),
    [ConversationStep.WORKER_CLIENT_SEARCH_EMPTY]: (h) => this.handleWorkerClientSearchEmpty(h),
    [ConversationStep.WORKER_CLIENT_CREATE]: (h) => this.handleWorkerClientCreate(h),
    [ConversationStep.WORKER_CLIENT_CREATE_PHONE]: (h) => this.handleWorkerClientCreatePhone(h),
    [ConversationStep.WORKER_CLIENT_CREATE_NAME]: (h) => this.handleWorkerClientCreateName(h),
    [ConversationStep.WORKER_CLIENT_CREATE_EMAIL]: (h) => this.handleWorkerClientCreateEmail(h),
    [ConversationStep.WORKER_CLIENT_CREATE_CONFIRM]: (h) => this.handleWorkerClientCreateConfirm(h),
    [ConversationStep.WORKER_CLIENT_CREATED]: (h) => this.handleWorkerClientCreated(h),
    [ConversationStep.WORKER_CLIENT_UPDATE_FIELD]: (h) => this.handleWorkerClientUpdateField(h),
    [ConversationStep.WORKER_CLIENT_UPDATE_FIELD_REPLY]: (h) =>
      this.handleWorkerClientUpdateFieldReply(h),
    [ConversationStep.WORKER_CLIENT_UPDATE_INPUT]: (h) => this.handleWorkerClientUpdateInput(h),
    [ConversationStep.WORKER_CLIENT_UPDATE_CONFIRM]: (h) => this.handleWorkerClientUpdateConfirm(h),
    [ConversationStep.WORKER_UNAVAIL_DAY]: (h) => this.handleWorkerUnavailDay(h),
    [ConversationStep.WORKER_UNAVAIL_DAY_INPUT]: (h) => this.handleWorkerUnavailDayInput(h),
    [ConversationStep.WORKER_UNAVAIL_SCOPE]: (h) => this.handleWorkerUnavailScope(h),
    [ConversationStep.WORKER_UNAVAIL_HOURS]: (h) => this.handleWorkerUnavailHours(h),
    [ConversationStep.WORKER_UNAVAIL_CONFLICTS]: (h) => this.handleWorkerUnavailConflicts(h),
    [ConversationStep.WORKER_HOURS_MENU]: (h) => this.handleWorkerHoursMenu(h),
    [ConversationStep.WORKER_HOURS_MENU_REPLY]: (h) => this.handleWorkerHoursMenuReply(h),
    [ConversationStep.WORKER_HOURS_INPUT]: (h) => this.handleWorkerHoursInput(h),
    [ConversationStep.WORKER_FIX_PICK_APT]: (h) => this.handleWorkerFixPickApt(h),
    [ConversationStep.WORKER_FIX_WEEKDAY]: (h) => this.handleWorkerFixWeekday(h),
    [ConversationStep.WORKER_FIX_WEEKDAY_REPLY]: (h) => this.handleWorkerFixWeekdayReply(h),
    [ConversationStep.WORKER_FIX_TIME]: (h) => this.handleWorkerFixTime(h),
    [ConversationStep.WORKER_FIX_CONFIRM]: (h) => this.handleWorkerFixConfirm(h),
    [ConversationStep.WORKER_UNFIX_PICK]: (h) => this.handleWorkerUnfixPick(h),
    [ConversationStep.WORKER_UNFIX_CONFIRM]: (h) => this.handleWorkerUnfixConfirm(h),
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
    const userId = this.actingUserId(handler);

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
        await this.startCancel(handler, this.actingUserId(handler));
        return;
      case FullMenuOption.MORE:
        await this.transitionTo(handler, ConversationStep.MORE_MENU);
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, this.homeStep(handler));
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
        await this.startReschedule(handler, this.actingUserId(handler));
        return;
      case MoreMenuOption.BACK:
        await this.transitionTo(handler, this.homeStep(handler));
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, ConversationStep.MORE_MENU);
    }
  }

  /** Lista (somente leitura) os agendamentos do cliente e oferece Voltar/Encerrar. */
  private async listAppointments(handler: MessageHandlerPayload): Promise<void> {
    const userId = this.actingUserId(handler);
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, this.homeStep(handler));
      return;
    }

    const appointments = await this.appointmentService.findManyByUserId(userId);

    if (appointments.length === 0) {
      await handler.sendMessage('text', '📭 Você não tem nenhum agendamento.');
      await this.transitionTo(handler, this.homeStep(handler));
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
  private async startCancel(
    handler: MessageHandlerPayload,
    userId: number | null,
  ): Promise<void> {
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, this.homeStep(handler));
      return;
    }

    const appointments = await this.appointmentService.findManyByUserId(userId);

    if (appointments.length === 0) {
      await handler.sendMessage('text', '📭 Nenhum agendamento para cancelar.');
      await this.transitionTo(handler, this.homeStep(handler));
      return;
    }

    if (appointments.length === 1) {
      const apt = appointments[0];
      await this.promptCancelConfirm(handler, apt.id, apt.datetime.toISOString());
      return;
    }

    // WhatsApp limita listas a 10 linhas; reservamos 2 (Cancelar todos + Voltar).
    const MAX_ROWS = 8;
    const shown = appointments.slice(0, MAX_ROWS);
    const body =
      appointments.length > MAX_ROWS
        ? `🗑️ Selecione o agendamento para cancelar (mostrando os ${MAX_ROWS} mais próximos; use "Cancelar todos" para o restante)`
        : '🗑️ Selecione o agendamento que deseja cancelar';

    await handler.sendMessage('list', body, [
      ...shown.map((apt) => ({
        id: String(apt.id),
        title: this.formatSlotLabel(apt.datetime.toISOString()),
      })),
      { id: CANCEL_ALL_ID, title: '❌ Cancelar todos' },
      { id: BACK_ID, title: BACK_LABEL },
    ]);

    handler.setState(handler.data.from, { step: ConversationStep.CANCEL_MANY });
  }

  async handleCancelMany(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleCancelMany', { from: handler.data.from, step: handler.conversationData.step });

    const reply = handler.data.text ?? '';

    if (reply === BACK_ID) {
      await this.transitionTo(handler, this.bookingBackStep(handler));
      return;
    }

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
      await this.transitionTo(handler, this.homeStep(handler));
      return;
    }

    // Ação destrutiva: só prossegue com confirmação explícita (evita cancelar
    // por engano se o usuário digitar texto em vez de tocar nos botões).
    if (reply !== ScheduleConfirmOption.CONFIRM) {
      await handler.sendMessage('text', '⚠️ Responda usando os botões *Sim* ou *Não*.');
      return;
    }

    const appointmentId = Number(handler.conversationData.data);
    if (!appointmentId || Number.isNaN(appointmentId)) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao cancelar. Vamos recomeçar.');
      await this.transitionTo(handler, this.homeStep(handler));
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
      await this.transitionTo(handler, this.homeStep(handler));
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
      await this.transitionTo(handler, this.homeStep(handler));
      return;
    }

    if (reply !== ScheduleConfirmOption.CONFIRM) {
      await handler.sendMessage('text', '⚠️ Responda usando os botões *Sim* ou *Não*.');
      return;
    }

    const userId = this.actingUserId(handler);
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao cancelar. Vamos recomeçar.');
      await this.transitionTo(handler, this.homeStep(handler));
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
      await this.transitionTo(handler, this.homeStep(handler));
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
  private async startReschedule(
    handler: MessageHandlerPayload,
    userId: number | null,
  ): Promise<void> {
    if (!userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, this.homeStep(handler));
      return;
    }

    const appointments = await this.appointmentService.findManyByUserId(userId);

    if (appointments.length === 0) {
      await handler.sendMessage('text', '📭 Você não tem nenhum agendamento para remarcar.');
      await this.transitionTo(handler, this.homeStep(handler));
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

    // WhatsApp limita listas a 10 linhas; reservamos 1 (Voltar).
    const MAX_ROWS = 9;
    const shown = appointments.slice(0, MAX_ROWS);
    const body =
      appointments.length > MAX_ROWS
        ? `🔄 Escolha um horário para remarcar (mostrando os ${MAX_ROWS} mais próximos)`
        : '🔄 Escolha um horário para remarcar';

    await handler.sendMessage('list', body, [
      ...shown.map((apt) => ({
        id: String(apt.id),
        title: this.formatSlotLabel(apt.datetime.toISOString()),
      })),
      { id: BACK_ID, title: BACK_LABEL },
    ]);

    handler.setState(handler.data.from, { step: ConversationStep.RESCHEDULE_MANY });
  }

  async handleRescheduleMany(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleRescheduleMany', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, this.bookingBackStep(handler));
      return;
    }

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
      await this.transitionTo(handler, this.homeStep(handler));
      return;
    }

    if (!context || !newIso) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao remarcar. Vamos recomeçar.');
      handler.setState(handler.data.from, { context: null });
      await this.transitionTo(handler, this.homeStep(handler));
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

  // ============================================================
  // Helpers de reuso pelo barbeiro (worker)
  // ============================================================

  /** Profissional alvo das operações: o barbeiro logado ou o padrão (cliente). */
  private resolveWorkerId(handler: MessageHandlerPayload): number {
    return handler.conversationData.workerId ?? DEFAULT_WORKER_ID;
  }

  /** Menu inicial para retorno/erro: do barbeiro quando role === 'worker'. */
  private homeStep(handler: MessageHandlerPayload): ConversationStep {
    return handler.conversationData.role === 'worker'
      ? ConversationStep.WORKER_MENU
      : ConversationStep.FULL_MENU;
  }

  /** Submenu de origem da busca de cliente, conforme a ação. */
  private searchBackStep(action: WorkerAction): ConversationStep {
    // update/fix/unfix vêm do menu Cliente; agendar/remarcar/cancelar do Agendamento.
    return action === 'update' || action === 'fix' || action === 'unfix'
      ? ConversationStep.WORKER_CLIENT_MENU
      : ConversationStep.WORKER_BOOKING_MENU;
  }

  /** Submenu de origem dos fluxos de agendar/remarcar/cancelar (barbeiro vs cliente). */
  private bookingBackStep(handler: MessageHandlerPayload): ConversationStep {
    return handler.conversationData.role === 'worker'
      ? ConversationStep.WORKER_BOOKING_MENU
      : ConversationStep.FULL_MENU;
  }

  /** Envia um prompt de texto livre acompanhado de um botão "Voltar". */
  private async promptWithBack(handler: MessageHandlerPayload, text: string): Promise<void> {
    await handler.sendMessage('button', text, [{ id: BACK_ID, title: BACK_LABEL }]);
  }

  /**
   * Cliente sobre o qual a ação opera. Para o barbeiro, é o cliente-alvo do
   * `WorkerActionContext`; para o cliente comum, é ele próprio (`userId`).
   */
  private actingUserId(handler: MessageHandlerPayload): number | null {
    if (handler.conversationData.role === 'worker') {
      return this.getWorkerContext(handler)?.targetUserId ?? null;
    }
    return handler.conversationData.userId;
  }

  private setWorkerContext(
    handler: MessageHandlerPayload,
    action: WorkerAction,
    targetUserId: number,
  ): void {
    const context: WorkerActionContext = { mode: 'worker_action', action, targetUserId };
    handler.setState(handler.data.from, { context: JSON.stringify(context) });
  }

  private getWorkerContext(handler: MessageHandlerPayload): WorkerActionContext | null {
    const raw = handler.conversationData.context;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as WorkerActionContext;
      return parsed.mode === 'worker_action' ? parsed : null;
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

    const buttons: Array<{ id: string; title: string }> = Object.values(ScheduleMenuOption).map(
      (id) => ({ id, title: ScheduleMenuLabels[id] }),
    );
    // Barbeiro pode voltar ao menu de agendamento; cliente segue no fluxo dele.
    if (handler.conversationData.role === 'worker') {
      buttons.push({ id: BACK_ID, title: BACK_LABEL });
    }

    await handler.sendMessage(
      'button',
      `${intro}\n\n✍️ Se já tem um dia e horário em mente, é só digitar.\nExemplo: *05/02 15:00*\n\n🔗 Para visualizar a agenda, acesse o link abaixo e depois digite o dia e o horário desejados:\n${PUBLIC_AGENDA_URL}\n\n👇 Caso prefira buscar de outra forma, use os botões abaixo.`,
      buttons,
    );

    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_MENU_REPLY });
  }

  async handleScheduleMenuReply(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleMenuReply', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    const reply = handler.data.text;

    if (reply === BACK_ID) {
      // Aborta a ação em andamento (agendar/remarcar) e volta ao menu de origem.
      handler.setState(handler.data.from, { context: null });
      await this.transitionTo(handler, this.bookingBackStep(handler));
      return;
    }

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

    await this.promptWithBack(handler, '🗓️ Digite o dia que deseja agendar.\n\nExemplo: *05/02*');

    handler.setState(handler.data.from, { step: ConversationStep.SCHEDULE_BY_DAY_LIST });
  }

  async handleScheduleByDayList(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleScheduleByDayList', {
      from: handler.data.from,
      step: handler.conversationData.step,
    });

    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    const day = parseDayInput(handler.data.text ?? '');
    if (!day) {
      await this.promptWithBack(
        handler,
        '⚠️ Formato inválido. Informe o dia no formato *DD/MM*.\nExemplo: *05/02*',
      );
      return;
    }

    if (this.isBeyondBookingWindow(day)) {
      await this.promptWithBack(handler, this.bookingLimitMessage());
      return;
    }

    // limita a 9 horários para sobrar espaço para a linha "Voltar" (máx. 10 itens na lista).
    const days = await this.appointmentService.getAvailableSlotsForDay(
      this.resolveWorkerId(handler),
      day,
      9,
    );
    const slots = toSlotListItems(days);
    const [, mm, dd] = formatBrazil(day).slice(0, 10).split('-');

    if (slots.length === 0) {
      await this.promptWithBack(
        handler,
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
    const days = await this.appointmentService.getNextAvailableSlots(
      this.resolveWorkerId(handler),
      9,
    );
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
    const days = await this.appointmentService.getAvailableSlotsForDay(
      this.resolveWorkerId(handler),
      day,
      9,
    );
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
      this.resolveWorkerId(handler),
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
    const userId = this.actingUserId(handler);

    if (!iso || !userId) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar o agendamento.');
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    try {
      await this.appointmentService.create({
        userId,
        workerId: this.resolveWorkerId(handler),
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

  // ============================================================
  // MENU DO BARBEIRO (WORKER)
  // ============================================================

  /** Topo do menu do barbeiro. Limpa qualquer ação em andamento. */
  async handleWorkerMenu(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleWorkerMenu', {
      from: handler.data.from,
      workerId: handler.conversationData.workerId,
    });

    const ownId = handler.conversationData.userId;
    const name = ownId ? ((await this.userService.getNameById(ownId)) ?? '') : '';

    await handler.sendMessage(
      'button',
      `💈 Olá${name ? `, ${name}` : ''}! O que você gostaria de fazer?`,
      Object.values(WorkerMenuOption).map((id) => ({ id, title: WorkerMenuLabels[id] })),
    );

    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_MENU_REPLY,
      data: null,
      context: null,
    });
  }

  async handleWorkerMenuReply(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    switch (reply) {
      case WorkerMenuOption.CLIENT:
        await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
        return;
      case WorkerMenuOption.SHOP:
        await this.transitionTo(handler, ConversationStep.WORKER_SHOP_MENU);
        return;
      case WorkerMenuOption.BOOKING:
        await this.transitionTo(handler, ConversationStep.WORKER_BOOKING_MENU);
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, ConversationStep.WORKER_MENU);
    }
  }

  // --- Categoria: Cliente ------------------------------------

  async handleWorkerClientMenu(handler: MessageHandlerPayload): Promise<void> {
    await handler.sendMessage(
      'list',
      '👤 Clientes — o que deseja fazer?',
      Object.values(WorkerClientMenuOption).map((id) => ({
        id,
        title: WorkerClientMenuLabels[id],
      })),
      { header: 'Clientes', button: 'Ver opções', sectionTitle: 'Ações' },
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_CLIENT_MENU_REPLY });
  }

  async handleWorkerClientMenuReply(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    switch (reply) {
      case WorkerClientMenuOption.CREATE:
        await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_CREATE);
        return;
      case WorkerClientMenuOption.UPDATE:
        await this.startClientSearch(handler, 'update');
        return;
      case WorkerClientMenuOption.FIX:
        await this.startClientSearch(handler, 'fix');
        return;
      case WorkerClientMenuOption.UNFIX:
        await this.startClientSearch(handler, 'unfix');
        return;
      case WorkerClientMenuOption.BACK:
        await this.transitionTo(handler, ConversationStep.WORKER_MENU);
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
    }
  }

  // --- Categoria: Barbearia ----------------------------------

  async handleWorkerShopMenu(handler: MessageHandlerPayload): Promise<void> {
    await handler.sendMessage(
      'list',
      '🏪 Barbearia — o que deseja fazer?',
      Object.values(WorkerShopMenuOption).map((id) => ({ id, title: WorkerShopMenuLabels[id] })),
      { header: 'Barbearia', button: 'Ver opções', sectionTitle: 'Ações' },
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_SHOP_MENU_REPLY });
  }

  async handleWorkerShopMenuReply(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    switch (reply) {
      case WorkerShopMenuOption.UNAVAILABLE:
        await this.transitionTo(handler, ConversationStep.WORKER_UNAVAIL_DAY);
        return;
      case WorkerShopMenuOption.WORKING_HOURS:
        await this.transitionTo(handler, ConversationStep.WORKER_HOURS_MENU);
        return;
      case WorkerShopMenuOption.BACK:
        await this.transitionTo(handler, ConversationStep.WORKER_MENU);
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, ConversationStep.WORKER_SHOP_MENU);
    }
  }

  // --- Categoria: Agendamento --------------------------------

  async handleWorkerBookingMenu(handler: MessageHandlerPayload): Promise<void> {
    await handler.sendMessage(
      'list',
      '📅 Agendamento — escolha uma ação:',
      Object.values(WorkerBookingMenuOption).map((id) => ({
        id,
        title: WorkerBookingMenuLabels[id],
      })),
      { header: 'Agendamento', button: 'Ver ações', sectionTitle: 'Ações' },
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_BOOKING_MENU_REPLY });
  }

  async handleWorkerBookingMenuReply(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    switch (reply) {
      case WorkerBookingMenuOption.SCHEDULE:
        await this.startClientSearch(handler, 'schedule');
        return;
      case WorkerBookingMenuOption.RESCHEDULE:
        await this.startClientSearch(handler, 'reschedule');
        return;
      case WorkerBookingMenuOption.CANCEL:
        await this.startClientSearch(handler, 'cancel');
        return;
      case WorkerBookingMenuOption.BACK:
        await this.transitionTo(handler, ConversationStep.WORKER_MENU);
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções do menu.');
        await this.transitionTo(handler, ConversationStep.WORKER_BOOKING_MENU);
    }
  }

  // --- Busca de cliente por nome (sub-fluxo compartilhado) ---

  /** Inicia a busca de cliente guardando a ação pretendida em `data`. */
  private async startClientSearch(
    handler: MessageHandlerPayload,
    action: WorkerAction,
  ): Promise<void> {
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_SEARCH,
      data: action,
      context: null,
    });
    await handler.callHandler(ConversationStep.WORKER_CLIENT_SEARCH);
  }

  async handleWorkerClientSearch(handler: MessageHandlerPayload): Promise<void> {
    await this.promptWithBack(handler, '🔎 Digite o *nome* do cliente que deseja buscar.');
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_CLIENT_SEARCH_RESULTS });
  }

  async handleWorkerClientSearchResults(handler: MessageHandlerPayload): Promise<void> {
    const action = (handler.conversationData.data ?? '') as WorkerAction;

    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, this.searchBackStep(action));
      return;
    }

    const term = handler.data.text?.trim() ?? '';

    if (term.length < 2) {
      await this.promptWithBack(handler, '⚠️ Digite ao menos 2 letras do nome do cliente.');
      return;
    }

    const matches = await this.userService.findByNameLike(term);

    if (matches.length === 0) {
      const buttons = [
        // "Cadastrar" só faz sentido no fluxo de agendamento de um cliente novo.
        ...(action === 'schedule'
          ? [
              {
                id: WorkerSearchEmptyOption.CREATE,
                title: WorkerSearchEmptyLabels[WorkerSearchEmptyOption.CREATE],
              },
            ]
          : []),
        {
          id: WorkerSearchEmptyOption.RETRY,
          title: WorkerSearchEmptyLabels[WorkerSearchEmptyOption.RETRY],
        },
        {
          id: WorkerSearchEmptyOption.BACK,
          title: WorkerSearchEmptyLabels[WorkerSearchEmptyOption.BACK],
        },
      ];

      await handler.sendMessage(
        'button',
        `😕 Nenhum cliente encontrado com "${term}".`,
        buttons,
      );
      handler.setState(handler.data.from, { step: ConversationStep.WORKER_CLIENT_SEARCH_EMPTY });
      return;
    }

    if (matches.length > 9) {
      await this.promptWithBack(
        handler,
        `🔎 Muitos resultados para "${term}". Refine o nome digitando mais letras.`,
      );
      return;
    }

    await handler.sendMessage(
      'list',
      `Selecione o cliente (${matches.length} encontrado(s)):`,
      [
        ...matches.map((u) => ({ id: String(u.id), title: this.clientListTitle(u.name, u.phone) })),
        { id: WORKER_SEARCH_BACK_ID, title: '↩️ Voltar' },
      ],
      { header: 'Clientes', button: 'Ver clientes', sectionTitle: 'Resultados' },
    );

    handler.setState(handler.data.from, { step: ConversationStep.WORKER_CLIENT_SEARCH_PICK });
  }

  async handleWorkerClientSearchPick(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';
    const action = (handler.conversationData.data ?? '') as WorkerAction;

    if (reply === WORKER_SEARCH_BACK_ID) {
      await this.transitionTo(handler, this.searchBackStep(action));
      return;
    }

    const targetUserId = Number(reply);
    if (!targetUserId || Number.isNaN(targetUserId)) {
      await handler.sendMessage('text', '⚠️ Seleção inválida. Escolha um cliente da lista.');
      return;
    }

    let client: Awaited<ReturnType<UserService['findUnique']>>;
    try {
      client = await this.userService.findUnique(targetUserId);
    } catch {
      await handler.sendMessage('text', '🔍 Cliente não encontrado. Escolha um da lista.');
      return;
    }

    this.setWorkerContext(handler, action, targetUserId);

    switch (action) {
      case 'schedule':
        await handler.sendMessage('text', `📅 Vamos agendar para *${client.name}*.`);
        await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
        return;
      case 'reschedule':
        await handler.sendMessage('text', `🔄 Remarcação de *${client.name}*.`);
        await this.startReschedule(handler, targetUserId);
        return;
      case 'cancel':
        await handler.sendMessage('text', `❌ Cancelamento de *${client.name}*.`);
        await this.startCancel(handler, targetUserId);
        return;
      case 'update':
        await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_UPDATE_FIELD);
        return;
      case 'fix':
        await this.startFix(handler, targetUserId, client.name);
        return;
      case 'unfix':
        await this.startUnfix(handler, targetUserId, client.name);
        return;
      default:
        await this.transitionTo(handler, ConversationStep.WORKER_MENU);
    }
  }

  async handleWorkerClientSearchEmpty(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';
    const action = (handler.conversationData.data ?? '') as WorkerAction;

    switch (reply) {
      case WorkerSearchEmptyOption.CREATE:
        await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_CREATE);
        return;
      case WorkerSearchEmptyOption.RETRY:
        await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_SEARCH);
        return;
      case WorkerSearchEmptyOption.BACK:
        await this.transitionTo(handler, this.searchBackStep(action));
        return;
      default:
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções.');
    }
  }

  // --- Cadastrar cliente -------------------------------------

  async handleWorkerClientCreate(handler: MessageHandlerPayload): Promise<void> {
    await this.promptWithBack(
      handler,
      '➕ Vamos cadastrar um cliente.\n\nDigite o *telefone* com DDD.\nExemplo: *11 91234-5678*',
    );
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_CREATE_PHONE,
      data: null,
      context: null,
    });
  }

  async handleWorkerClientCreatePhone(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    const phone = this.normalizePhone(handler.data.text ?? '');
    if (!phone) {
      await this.promptWithBack(
        handler,
        '⚠️ Telefone inválido. Digite com DDD.\nExemplo: *11 91234-5678*',
      );
      return;
    }

    await this.promptWithBack(handler, 'Agora o *nome completo* do cliente.');
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_CREATE_NAME,
      data: JSON.stringify({ phone }),
    });
  }

  async handleWorkerClientCreateName(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    const prev = JSON.parse(handler.conversationData.data ?? '{}') as { phone: string };
    const name = toTitleCase(handler.data.text?.trim() ?? '');
    if (!name) {
      await this.promptWithBack(handler, '⚠️ Nome inválido. Digite o nome completo do cliente.');
      return;
    }

    await this.promptWithBack(handler, 'Por fim, o *email* do cliente.');
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_CREATE_EMAIL,
      data: JSON.stringify({ ...prev, name }),
    });
  }

  async handleWorkerClientCreateEmail(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    const prev = JSON.parse(handler.conversationData.data ?? '{}') as {
      phone: string;
      name: string;
    };
    const email = handler.data.text?.trim() ?? '';
    if (!this.isValidEmail(email)) {
      await this.promptWithBack(handler, '⚠️ Email inválido. Digite um email válido.');
      return;
    }

    const data = { ...prev, email };
    await handler.sendMessage(
      'button',
      `Confirme os dados do cliente: 📋\n\n*Nome:* ${data.name}\n*Telefone:* ${data.phone}\n*Email:* ${data.email}`,
      [
        { id: SignInConfirmOption.CONFIRM, title: '✅ Confirmar' },
        { id: SignInConfirmOption.RETRY, title: '✏️ Corrigir' },
        { id: BACK_ID, title: BACK_LABEL },
      ],
    );
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_CREATE_CONFIRM,
      data: JSON.stringify(data),
    });
  }

  async handleWorkerClientCreateConfirm(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    if (reply === SignInConfirmOption.RETRY) {
      await handler.sendMessage('text', 'Sem problemas! Vamos começar de novo. 🔄');
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_CREATE);
      return;
    }

    const { name, email, phone } = JSON.parse(handler.conversationData.data ?? '{}') as {
      name: string;
      email: string;
      phone: string;
    };

    let created: Awaited<ReturnType<UserService['create']>>;
    try {
      created = await this.userService.create({ name, email, phone });
    } catch (err) {
      log.error(
        'handleWorkerClientCreateConfirm: falha ao cadastrar cliente',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage(
        'text',
        '😕 Não foi possível cadastrar — telefone ou email já podem estar em uso.',
      );
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    await handler.sendMessage(
      'button',
      `✅ Cliente *${created.name}* cadastrado com sucesso!\n\nO que deseja fazer agora?`,
      [
        {
          id: WorkerCreatedOption.SCHEDULE,
          title: WorkerCreatedLabels[WorkerCreatedOption.SCHEDULE],
        },
        { id: WorkerCreatedOption.MENU, title: WorkerCreatedLabels[WorkerCreatedOption.MENU] },
      ],
    );
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_CREATED,
      data: String(created.id),
    });
  }

  async handleWorkerClientCreated(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';
    const newUserId = Number(handler.conversationData.data);

    if (reply === WorkerCreatedOption.SCHEDULE) {
      if (!newUserId || Number.isNaN(newUserId)) {
        await this.transitionTo(handler, ConversationStep.WORKER_MENU);
        return;
      }
      this.setWorkerContext(handler, 'schedule', newUserId);
      await handler.sendMessage('text', '📅 Vamos ao agendamento do novo cliente.');
      await this.transitionTo(handler, ConversationStep.SCHEDULE_MENU);
      return;
    }

    // "Voltar ao menu" ou qualquer outra resposta.
    await this.transitionTo(handler, ConversationStep.WORKER_MENU);
  }

  // --- Atualizar cliente -------------------------------------

  async handleWorkerClientUpdateField(handler: MessageHandlerPayload): Promise<void> {
    const ctx = this.getWorkerContext(handler);
    if (!ctx) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    let client: Awaited<ReturnType<UserService['findUnique']>>;
    try {
      client = await this.userService.findUnique(ctx.targetUserId);
    } catch {
      await handler.sendMessage('text', '🔍 Cliente não encontrado. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    await handler.sendMessage(
      'list',
      `✏️ Atualizar *${client.name}*\n\n📞 ${client.phone}\n📧 ${client.email}\n\nQual dado deseja alterar?`,
      Object.values(ClientUpdateFieldOption).map((id) => ({
        id,
        title: ClientUpdateFieldLabels[id],
      })),
      { header: 'Atualizar cliente', button: 'Ver campos', sectionTitle: 'Campos' },
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_CLIENT_UPDATE_FIELD_REPLY });
  }

  async handleWorkerClientUpdateFieldReply(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === ClientUpdateFieldOption.BACK) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    const fieldByOption: Record<string, 'phone' | 'name' | 'email'> = {
      [ClientUpdateFieldOption.PHONE]: 'phone',
      [ClientUpdateFieldOption.NAME]: 'name',
      [ClientUpdateFieldOption.EMAIL]: 'email',
    };
    const field = fieldByOption[reply];
    if (!field) {
      await handler.sendMessage('text', '⚠️ Opção inválida. Escolha um campo da lista.');
      return;
    }

    await this.promptWithBack(handler, `Digite o novo *${this.fieldLabel(field)}*.`);
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_UPDATE_INPUT,
      data: field,
    });
  }

  async handleWorkerClientUpdateInput(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_UPDATE_FIELD);
      return;
    }

    const field = (handler.conversationData.data ?? '') as 'phone' | 'name' | 'email';
    const raw = handler.data.text?.trim() ?? '';

    let value: string;
    if (field === 'phone') {
      const normalized = this.normalizePhone(raw);
      if (!normalized) {
        await this.promptWithBack(handler, '⚠️ Telefone inválido. Digite com DDD.');
        return;
      }
      value = normalized;
    } else if (field === 'email') {
      if (!this.isValidEmail(raw)) {
        await this.promptWithBack(handler, '⚠️ Email inválido. Digite um email válido.');
        return;
      }
      value = raw;
    } else {
      value = toTitleCase(raw);
      if (!value) {
        await this.promptWithBack(handler, '⚠️ Nome inválido. Digite o nome completo.');
        return;
      }
    }

    await handler.sendMessage(
      'button',
      `Confirma alterar o *${this.fieldLabel(field)}* para *${value}*?`,
      [
        { id: ScheduleConfirmOption.CONFIRM, title: ScheduleConfirmLabels[ScheduleConfirmOption.CONFIRM] },
        { id: ScheduleConfirmOption.DECLINE, title: ScheduleConfirmLabels[ScheduleConfirmOption.DECLINE] },
      ],
    );
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_CLIENT_UPDATE_CONFIRM,
      data: JSON.stringify({ field, value }),
    });
  }

  async handleWorkerClientUpdateConfirm(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === ScheduleConfirmOption.DECLINE) {
      await handler.sendMessage('text', 'Tudo bem, nada foi alterado.');
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    const ctx = this.getWorkerContext(handler);
    const { field, value } = JSON.parse(handler.conversationData.data ?? '{}') as {
      field: 'phone' | 'name' | 'email';
      value: string;
    };

    if (!ctx || !field) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao atualizar. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    try {
      await this.userService.update(ctx.targetUserId, { [field]: value });
      await handler.sendMessage('text', '✅ Cliente atualizado com sucesso!');
    } catch (err) {
      log.error(
        'handleWorkerClientUpdateConfirm: falha ao atualizar cliente',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage(
        'text',
        '😕 Não foi possível atualizar — o telefone ou email pode já estar em uso.',
      );
    }

    await this.transitionTo(handler, ConversationStep.WORKER_MENU);
  }

  // --- Indisponibilizar horário ------------------------------

  async handleWorkerUnavailDay(handler: MessageHandlerPayload): Promise<void> {
    await this.promptWithBack(
      handler,
      '🚫 Indisponibilizar horário.\n\nDigite o *dia* no formato *DD/MM*.\nExemplo: *05/02*',
    );
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_UNAVAIL_DAY_INPUT,
      data: null,
      context: null,
    });
  }

  async handleWorkerUnavailDayInput(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_SHOP_MENU);
      return;
    }

    const day = parseDayInput(handler.data.text ?? '');
    if (!day) {
      await this.promptWithBack(
        handler,
        '⚠️ Formato inválido. Informe o dia no formato *DD/MM*.\nExemplo: *05/02*',
      );
      return;
    }

    const ymd = formatBrazil(day).slice(0, 10);
    const [, mm, dd] = ymd.split('-');

    await handler.sendMessage(
      'button',
      `Para o dia *${dd}/${mm}* — bloquear o dia todo ou um horário específico?`,
      Object.values(UnavailableScopeOption).map((id) => ({ id, title: UnavailableScopeLabels[id] })),
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_UNAVAIL_SCOPE, data: ymd });
  }

  async handleWorkerUnavailScope(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';
    const ymd = handler.conversationData.data ?? '';

    if (reply === UnavailableScopeOption.BACK) {
      await this.transitionTo(handler, ConversationStep.WORKER_SHOP_MENU);
      return;
    }

    if (reply === UnavailableScopeOption.ALL_DAY) {
      const begin = parseBrazilDateTime(`${ymd}T00:00:00`);
      const end = new Date(begin.getTime() + 24 * 60 * 60 * 1000);
      await this.processUnavailability(handler, ymd, begin, end, true);
      return;
    }

    if (reply === UnavailableScopeOption.HOURS) {
      await this.promptWithBack(
        handler,
        'Digite a faixa de horário no formato *HH:mm-HH:mm*.\nExemplo: *14:00-16:00*',
      );
      handler.setState(handler.data.from, { step: ConversationStep.WORKER_UNAVAIL_HOURS });
      return;
    }

    await handler.sendMessage('text', '⚠️ Opção inválida. Escolha uma das opções.');
  }

  async handleWorkerUnavailHours(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_SHOP_MENU);
      return;
    }

    const ymd = handler.conversationData.data ?? '';
    const range = this.parseHourRange(handler.data.text ?? '');
    if (!range) {
      await this.promptWithBack(
        handler,
        '⚠️ Formato inválido. Use *HH:mm-HH:mm*.\nExemplo: *14:00-16:00*',
      );
      return;
    }

    const begin = parseBrazilDateTime(`${ymd}T${range.begin}:00`);
    const end = parseBrazilDateTime(`${ymd}T${range.end}:00`);
    if (end.getTime() <= begin.getTime()) {
      await this.promptWithBack(handler, '⚠️ O horário final deve ser depois do inicial.');
      return;
    }

    await this.processUnavailability(handler, ymd, begin, end, false);
  }

  /** Detecta conflitos no período; se houver, pede confirmação antes de cancelar. */
  private async processUnavailability(
    handler: MessageHandlerPayload,
    ymd: string,
    begin: Date,
    end: Date,
    allDay: boolean,
  ): Promise<void> {
    const workerId = this.resolveWorkerId(handler);
    const conflicts = await this.appointmentService.findManyByWorkerOverlapping(workerId, begin, end);

    if (conflicts.length === 0) {
      await this.commitUnavailability(handler, ymd, begin, end, allDay, 0);
      return;
    }

    const lines = await Promise.all(
      conflicts.map(async (apt) => {
        const name = (await this.userService.getNameById(apt.userId)) ?? 'Cliente';
        return `• ${this.formatSlotLabel(apt.datetime.toISOString())} — ${name}`;
      }),
    );

    await handler.sendMessage(
      'button',
      `⚠️ Há ${conflicts.length} agendamento(s) nesse período:\n\n${lines.join('\n')}\n\nConfirmar a indisponibilidade e *cancelar* esses agendamentos?`,
      [
        { id: ScheduleConfirmOption.CONFIRM, title: ScheduleConfirmLabels[ScheduleConfirmOption.CONFIRM] },
        { id: ScheduleConfirmOption.DECLINE, title: ScheduleConfirmLabels[ScheduleConfirmOption.DECLINE] },
      ],
    );

    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_UNAVAIL_CONFLICTS,
      data: JSON.stringify({ ymd, begin: begin.toISOString(), end: end.toISOString(), allDay }),
    });
  }

  async handleWorkerUnavailConflicts(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === ScheduleConfirmOption.DECLINE) {
      await handler.sendMessage('text', 'Tudo bem, nada foi alterado.');
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    // Ação destrutiva (cancela agendamentos de clientes): exige confirmação explícita.
    if (reply !== ScheduleConfirmOption.CONFIRM) {
      await handler.sendMessage('text', '⚠️ Responda usando os botões *Sim* ou *Não*.');
      return;
    }

    const { ymd, begin, end, allDay } = JSON.parse(handler.conversationData.data ?? '{}') as {
      ymd: string;
      begin: string;
      end: string;
      allDay: boolean;
    };
    const beginDate = new Date(begin);
    const endDate = new Date(end);
    const workerId = this.resolveWorkerId(handler);

    const conflicts = await this.appointmentService.findManyByWorkerOverlapping(
      workerId,
      beginDate,
      endDate,
    );
    for (const apt of conflicts) {
      try {
        await this.appointmentService.cancel(apt.id);
      } catch (err) {
        log.error(
          'handleWorkerUnavailConflicts: falha ao cancelar agendamento conflitante',
          err instanceof Error ? err : { appointmentId: apt.id, err },
        );
      }
    }

    await this.commitUnavailability(handler, ymd, beginDate, endDate, allDay, conflicts.length);
  }

  /** Persiste a indisponibilidade e confirma ao barbeiro. */
  private async commitUnavailability(
    handler: MessageHandlerPayload,
    ymd: string,
    begin: Date,
    end: Date,
    allDay: boolean,
    cancelledCount: number,
  ): Promise<void> {
    const workerId = this.resolveWorkerId(handler);
    const scheduleId = await this.ensureScheduleId(workerId);

    try {
      await this.unavailablePeriodService.create({
        scheduleId,
        date: begin.toISOString(),
        begin: begin.toISOString(),
        end: end.toISOString(),
        allDay,
      });
    } catch (err) {
      log.error(
        'commitUnavailability: falha ao salvar indisponibilidade',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage('text', '😕 Não foi possível salvar a indisponibilidade. Tente novamente.');
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    const [, mm, dd] = ymd.split('-');
    const scopeLabel = allDay
      ? 'o dia todo'
      : `das ${this.formatHourFromDate(begin)} às ${this.formatHourFromDate(end)}`;
    const cancelMsg = cancelledCount
      ? `\n\n🗑️ ${cancelledCount} agendamento(s) cancelado(s).`
      : '';

    await handler.sendMessage(
      'text',
      `✅ Indisponibilidade registrada para *${dd}/${mm}* (${scopeLabel}).${cancelMsg}`,
    );
    await this.transitionTo(handler, ConversationStep.WORKER_MENU);
  }

  // --- Horário de funcionamento ------------------------------

  async handleWorkerHoursMenu(handler: MessageHandlerPayload): Promise<void> {
    const workerId = this.resolveWorkerId(handler);
    const scheduleId = await this.ensureScheduleId(workerId);
    const rows = await this.workingHourService.findManyBySchedule(scheduleId);

    const byWeekday = new Map<number, WorkingHourWindow[]>();
    for (const row of rows) {
      const list = byWeekday.get(row.weekday) ?? [];
      list.push({ begin: row.begin, end: row.end });
      byWeekday.set(row.weekday, list);
    }

    const lines = WEEKDAY_DISPLAY_ORDER.map((wd) => {
      const windows = (byWeekday.get(wd) ?? []).sort((a, b) => a.begin.localeCompare(b.begin));
      return `*${WEEKDAY_SHORT[wd]}:* ${this.formatDayHours(windows)}`;
    });

    const dayRows = WEEKDAY_DISPLAY_ORDER.map((wd) => ({
      id: `${WORKER_HOURS_DAY_PREFIX}${wd}`,
      title: WEEKDAY_SHORT[wd],
    }));

    await handler.sendMessage(
      'list',
      `🕐 *Horário de funcionamento*\n\n${lines.join('\n')}\n\nEscolha um dia para editar.`,
      [
        ...dayRows,
        { id: WORKER_HOURS_WEEKDAYS_ID, title: '🗓️ Dias úteis (Seg–Sex)' },
        { id: BACK_ID, title: BACK_LABEL },
      ],
      { header: 'Horário de func.', button: 'Escolher dia', sectionTitle: 'Dias da semana' },
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_HOURS_MENU_REPLY });
  }

  async handleWorkerHoursMenuReply(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_SHOP_MENU);
      return;
    }

    if (reply === WORKER_HOURS_WEEKDAYS_ID) {
      await this.promptHoursInput(handler, 'dias úteis (Seg–Sex)', { target: 'weekdays' });
      return;
    }

    if (reply.startsWith(WORKER_HOURS_DAY_PREFIX)) {
      const weekday = Number(reply.slice(WORKER_HOURS_DAY_PREFIX.length));
      if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha um dia da lista.');
        return;
      }
      await this.promptHoursInput(handler, WEEKDAY_SHORT[weekday], { target: 'day', weekday });
      return;
    }

    await handler.sendMessage('text', '⚠️ Opção inválida. Escolha um dia da lista.');
  }

  /** Pede as faixas de horário e guarda o alvo (um dia ou dias úteis) no estado. */
  private async promptHoursInput(
    handler: MessageHandlerPayload,
    label: string,
    target: { target: 'day'; weekday: number } | { target: 'weekdays' },
  ): Promise<void> {
    await this.promptWithBack(
      handler,
      `🕐 Digite o horário de *${label}*.\n\nEx.: *08:00-12:00, 13:00-18:00*\n(várias faixas separadas por vírgula)\n\nPara folga, digite *fechado*.`,
    );
    handler.setState(handler.data.from, {
      step: ConversationStep.WORKER_HOURS_INPUT,
      data: JSON.stringify(target),
    });
  }

  async handleWorkerHoursInput(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_HOURS_MENU);
      return;
    }

    const windows = this.parseWorkingHours(handler.data.text ?? '');
    if (windows === null) {
      await this.promptWithBack(
        handler,
        '⚠️ Formato inválido. Use *HH:mm-HH:mm* (separe várias por vírgula) ou digite *fechado*.',
      );
      return;
    }

    const parsed = JSON.parse(handler.conversationData.data ?? '{}') as
      | { target: 'day'; weekday: number }
      | { target: 'weekdays' };

    const weekdays = parsed.target === 'weekdays' ? [1, 2, 3, 4, 5] : [parsed.weekday];
    const workerId = this.resolveWorkerId(handler);
    const scheduleId = await this.ensureScheduleId(workerId);

    try {
      for (const wd of weekdays) {
        await this.workingHourService.replaceWeekday(scheduleId, wd, windows);
      }
    } catch (err) {
      log.error(
        'handleWorkerHoursInput: falha ao salvar horário de funcionamento',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage('text', '😕 Não foi possível salvar o horário. Tente novamente.');
      await this.transitionTo(handler, ConversationStep.WORKER_HOURS_MENU);
      return;
    }

    const label =
      parsed.target === 'weekdays' ? 'dias úteis (Seg–Sex)' : WEEKDAY_SHORT[parsed.weekday];
    await handler.sendMessage(
      'text',
      `✅ Horário de *${label}* atualizado: ${this.formatDayHours(windows)}.`,
    );
    await this.transitionTo(handler, ConversationStep.WORKER_HOURS_MENU);
  }

  // --- Fixar cliente (recorrência semanal) -------------------

  /** Início do "fixar": oferece os horários já agendados ou pede dia/hora. */
  private async startFix(
    handler: MessageHandlerPayload,
    userId: number,
    name: string,
  ): Promise<void> {
    const appointments = await this.appointmentService.findManyByUserId(userId);
    const future = appointments
      .filter((apt) => apt.datetime.getTime() > Date.now() && !apt.seriesId)
      .sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

    if (future.length > 0) {
      await handler.sendMessage(
        'list',
        `📌 Fixar *${name}* — escolha um horário já agendado para repetir toda semana, ou informe outro:`,
        [
          ...future.slice(0, 8).map((apt) => ({
            id: String(apt.id),
            title: this.formatSlotLabel(apt.datetime.toISOString()),
          })),
          { id: WORKER_FIX_OTHER_TIME_ID, title: '🕐 Outro horário' },
          { id: BACK_ID, title: BACK_LABEL },
        ],
        { header: 'Fixar horário', button: 'Ver horários', sectionTitle: 'Agendamentos' },
      );
      handler.setState(handler.data.from, { step: ConversationStep.WORKER_FIX_PICK_APT });
      return;
    }

    await this.transitionTo(handler, ConversationStep.WORKER_FIX_WEEKDAY);
  }

  async handleWorkerFixPickApt(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }
    if (reply === WORKER_FIX_OTHER_TIME_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_FIX_WEEKDAY);
      return;
    }

    const appointmentId = Number(reply);
    if (!appointmentId || Number.isNaN(appointmentId)) {
      await handler.sendMessage('text', '⚠️ Seleção inválida. Escolha um horário da lista.');
      return;
    }

    let appointment: Awaited<ReturnType<AppointmentService['findUnique']>>;
    try {
      appointment = await this.appointmentService.findUnique(appointmentId);
    } catch {
      await handler.sendMessage('text', '🔍 Agendamento não encontrado. Escolha um da lista.');
      return;
    }

    await this.promptFixConfirm(handler, appointment.datetime.toISOString());
  }

  async handleWorkerFixWeekday(handler: MessageHandlerPayload): Promise<void> {
    await handler.sendMessage(
      'list',
      '📌 Em qual *dia da semana* deseja fixar?',
      [
        ...WEEKDAY_DISPLAY_ORDER.map((wd) => ({
          id: `${WORKER_FIX_DAY_PREFIX}${wd}`,
          title: WEEKDAY_SHORT[wd],
        })),
        { id: BACK_ID, title: BACK_LABEL },
      ],
      { header: 'Fixar horário', button: 'Escolher dia', sectionTitle: 'Dia da semana' },
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_FIX_WEEKDAY_REPLY });
  }

  async handleWorkerFixWeekdayReply(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    if (reply.startsWith(WORKER_FIX_DAY_PREFIX)) {
      const weekday = Number(reply.slice(WORKER_FIX_DAY_PREFIX.length));
      if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
        await handler.sendMessage('text', '⚠️ Opção inválida. Escolha um dia da lista.');
        return;
      }
      await this.promptWithBack(
        handler,
        `🕐 Que horário, na *${WEEKDAY_SHORT[weekday]}*?\nExemplo: *15:00*`,
      );
      handler.setState(handler.data.from, {
        step: ConversationStep.WORKER_FIX_TIME,
        data: String(weekday),
      });
      return;
    }

    await handler.sendMessage('text', '⚠️ Opção inválida. Escolha um dia da lista.');
  }

  async handleWorkerFixTime(handler: MessageHandlerPayload): Promise<void> {
    if (handler.data.text === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_FIX_WEEKDAY);
      return;
    }

    const time = this.parseTimeOfDay(handler.data.text ?? '');
    if (!time) {
      await this.promptWithBack(handler, '⚠️ Horário inválido. Use *HH:mm*.\nExemplo: *15:00*');
      return;
    }

    const weekday = Number(handler.conversationData.data);
    if (Number.isNaN(weekday)) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    await this.promptFixConfirm(handler, this.nextWeekdayOccurrenceIso(weekday, time));
  }

  /** Renderiza a confirmação de fixação para um horário ISO e aguarda Sim/Não. */
  private async promptFixConfirm(handler: MessageHandlerPayload, iso: string): Promise<void> {
    const count = this.countWeeklyOccurrences(new Date(iso));
    const { lastDay } = this.appointmentService.getBookingWindow();
    const [, mm, dd] = formatBrazil(lastDay).slice(0, 10).split('-');

    await handler.sendMessage(
      'button',
      `📌 Fixar *${this.formatSlotLabel(iso)}* e repetir *toda semana*?\n\nSerão reservados até ${count} horário(s), até ${dd}/${mm}.`,
      [
        { id: ScheduleConfirmOption.CONFIRM, title: ScheduleConfirmLabels[ScheduleConfirmOption.CONFIRM] },
        { id: ScheduleConfirmOption.DECLINE, title: ScheduleConfirmLabels[ScheduleConfirmOption.DECLINE] },
      ],
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_FIX_CONFIRM, data: iso });
  }

  async handleWorkerFixConfirm(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === ScheduleConfirmOption.DECLINE) {
      await handler.sendMessage('text', 'Tudo bem, nada foi fixado.');
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }
    if (reply !== ScheduleConfirmOption.CONFIRM) {
      await handler.sendMessage('text', '⚠️ Responda usando os botões *Sim* ou *Não*.');
      return;
    }

    const ctx = this.getWorkerContext(handler);
    const iso = handler.conversationData.data;
    if (!ctx || !iso) {
      await handler.sendMessage('text', '⚠️ Ocorreu um erro ao fixar. Vamos recomeçar.');
      await this.transitionTo(handler, ConversationStep.WORKER_MENU);
      return;
    }

    try {
      const result = await this.appointmentService.createFixedSeries(
        this.resolveWorkerId(handler),
        ctx.targetUserId,
        new Date(iso),
      );
      const total = result.created + result.merged;
      let msg = `✅ Horário fixado! ${total} ocorrência(s) reservada(s) toda semana.`;
      if (result.skipped > 0) {
        msg += `\n⚠️ ${result.skipped} semana(s) não reservada(s) (horário já ocupado).`;
      }
      await handler.sendMessage('text', msg);
    } catch (err) {
      log.error(
        'handleWorkerFixConfirm: falha ao fixar série',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage('text', '😕 Não foi possível fixar o horário. Tente novamente.');
    }

    await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
  }

  // --- Desfixar cliente --------------------------------------

  private async startUnfix(
    handler: MessageHandlerPayload,
    userId: number,
    name: string,
  ): Promise<void> {
    const series = await this.appointmentService.findActiveSeriesByUser(userId);

    if (series.length === 0) {
      await handler.sendMessage('text', `📭 *${name}* não tem nenhum horário fixo.`);
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }

    await handler.sendMessage(
      'list',
      `🗑️ Desfixar *${name}* — escolha qual horário fixo remover:`,
      [
        ...series.slice(0, 9).map((s) => ({ id: s.seriesId, title: this.seriesLabel(s.next) })),
        { id: BACK_ID, title: BACK_LABEL },
      ],
      { header: 'Desfixar', button: 'Ver horários', sectionTitle: 'Horários fixos' },
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_UNFIX_PICK });
  }

  async handleWorkerUnfixPick(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === BACK_ID) {
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }
    if (!reply) {
      await handler.sendMessage('text', '⚠️ Seleção inválida. Escolha um horário da lista.');
      return;
    }

    await handler.sendMessage(
      'button',
      '⚠️ Remover este horário fixo e *todas as ocorrências futuras*?',
      [
        { id: ScheduleConfirmOption.CONFIRM, title: ScheduleConfirmLabels[ScheduleConfirmOption.CONFIRM] },
        { id: ScheduleConfirmOption.DECLINE, title: ScheduleConfirmLabels[ScheduleConfirmOption.DECLINE] },
      ],
    );
    handler.setState(handler.data.from, { step: ConversationStep.WORKER_UNFIX_CONFIRM, data: reply });
  }

  async handleWorkerUnfixConfirm(handler: MessageHandlerPayload): Promise<void> {
    const reply = handler.data.text ?? '';

    if (reply === ScheduleConfirmOption.DECLINE) {
      await handler.sendMessage('text', 'Tudo bem, nada foi alterado.');
      await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
      return;
    }
    if (reply !== ScheduleConfirmOption.CONFIRM) {
      await handler.sendMessage('text', '⚠️ Responda usando os botões *Sim* ou *Não*.');
      return;
    }

    const seriesId = handler.conversationData.data ?? '';
    try {
      const cancelled = await this.appointmentService.cancelSeriesFromNow(seriesId);
      await handler.sendMessage(
        'text',
        `✅ Horário fixo removido. ${cancelled} ocorrência(s) futura(s) cancelada(s).`,
      );
    } catch (err) {
      log.error(
        'handleWorkerUnfixConfirm: falha ao desfixar série',
        err instanceof Error ? err : { from: handler.data.from, err },
      );
      await handler.sendMessage('text', '😕 Não foi possível desfixar agora. Tente novamente.');
    }

    await this.transitionTo(handler, ConversationStep.WORKER_CLIENT_MENU);
  }

  // --- Helpers do menu do barbeiro ---------------------------

  /** Weekday (0=domingo) de um instante no fuso de Brasília. */
  private brWeekday(date: Date): number {
    return new Date(date.getTime() - 3 * 60 * 60 * 1000).getUTCDay();
  }

  /** Faz o parse de um horário "H:mm"/"HH:mm" para "HH:mm". Retorna null se inválido. */
  private parseTimeOfDay(input: string): string | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${match[2]}`;
  }

  /** ISO (-03:00) da próxima ocorrência futura de um (weekday, "HH:mm"). */
  private nextWeekdayOccurrenceIso(weekday: number, time: string): string {
    const now = new Date();
    const todayStart = parseBrazilDateTime(`${formatBrazil(now).slice(0, 10)}T00:00:00`);
    const delta = (weekday - this.brWeekday(todayStart) + 7) % 7;

    const dayYmd = formatBrazil(new Date(todayStart.getTime() + delta * ONE_DAY_MS)).slice(0, 10);
    let occ = parseBrazilDateTime(`${dayYmd}T${time}:00`);

    if (occ.getTime() <= now.getTime()) {
      const nextYmd = formatBrazil(new Date(occ.getTime() + 7 * ONE_DAY_MS)).slice(0, 10);
      occ = parseBrazilDateTime(`${nextYmd}T${time}:00`);
    }
    return formatBrazil(occ);
  }

  /** Quantas ocorrências semanais futuras cabem na janela de agendamento. */
  private countWeeklyOccurrences(first: Date): number {
    const { endExclusive } = this.appointmentService.getBookingWindow();
    const now = Date.now();
    let count = 0;
    for (
      let occ = new Date(first);
      occ.getTime() < endExclusive.getTime();
      occ = new Date(occ.getTime() + 7 * ONE_DAY_MS)
    ) {
      if (occ.getTime() > now) count++;
    }
    return count;
  }

  /** Rótulo curto de uma série a partir da próxima ocorrência: "Toda Ter 15:00". */
  private seriesLabel(next: Date): string {
    const time = formatBrazil(next).slice(11, 16);
    return `Toda ${WEEKDAY_SHORT[this.brWeekday(next)]} ${time}`;
  }

  /** Retorna o id da agenda do profissional, criando-a se ainda não existir. */
  private async ensureScheduleId(workerId: number): Promise<number> {
    try {
      const schedule = await this.scheduleService.findUniqueByWorkerId(workerId);
      return schedule.id;
    } catch {
      const schedule = await this.scheduleService.create({ workerId });
      return schedule.id;
    }
  }

  /** "08:00–12:00, 13:00–18:00" ou "fechado" quando não há faixas. */
  private formatDayHours(windows: WorkingHourWindow[]): string {
    if (windows.length === 0) return 'fechado';
    return windows.map((w) => `${w.begin.slice(0, 5)}–${w.end.slice(0, 5)}`).join(', ');
  }

  /**
   * Faz o parse de faixas "HH:mm-HH:mm[, HH:mm-HH:mm]" para janelas (HH:MM:SS).
   * Palavras como "fechado"/"folga" retornam lista vazia (dia sem expediente).
   * Retorna null se o formato for inválido.
   */
  private parseWorkingHours(input: string): WorkingHourWindow[] | null {
    const raw = input.trim().toLowerCase();
    if (['fechado', 'folga', 'fechar', '-', 'nenhum'].includes(raw)) return [];

    const parts = input
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;

    const windows: WorkingHourWindow[] = [];
    for (const part of parts) {
      const range = this.parseHourRange(part);
      if (!range) return null;
      const begin = `${range.begin}:00`;
      const end = `${range.end}:00`;
      if (end <= begin) return null;
      windows.push({ begin, end });
    }
    return windows;
  }

  /** Título de linha de lista para um cliente (limite ~24 chars do WhatsApp). */
  private clientListTitle(name: string, phone: string | null): string {
    const suffix = phone ? ` •${phone.slice(-4)}` : '';
    const room = 24 - suffix.length;
    return `${name.slice(0, room)}${suffix}`;
  }

  private fieldLabel(field: 'phone' | 'name' | 'email'): string {
    return field === 'phone' ? 'telefone' : field === 'name' ? 'nome' : 'email';
  }

  /** Normaliza um telefone BR para dígitos com DDI 55. Retorna null se inválido. */
  private normalizePhone(input: string): string | null {
    const digits = input.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
    return null;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /** Faz o parse de uma faixa "HH:mm-HH:mm" validando horas/minutos. */
  private parseHourRange(input: string): { begin: string; end: string } | null {
    const match = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/.exec(input.trim());
    if (!match) return null;
    const [, h1, m1, h2, m2] = match;
    if (Number(h1) > 23 || Number(h2) > 23 || Number(m1) > 59 || Number(m2) > 59) return null;
    return { begin: `${h1}:${m1}`, end: `${h2}:${m2}` };
  }

  private formatHourFromDate(date: Date): string {
    return formatBrazil(date).slice(11, 16);
  }

  async handleClose(handler: MessageHandlerPayload): Promise<void> {
    log.debug('handleClose', { from: handler.data.from, step: handler.conversationData.step });

    const reply = handler.data.text ?? '';

    if (reply === CloseMenuOption.BACK) {
      await this.transitionTo(handler, this.homeStep(handler));
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
