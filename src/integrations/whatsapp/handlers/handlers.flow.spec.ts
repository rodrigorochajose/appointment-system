import { WhatsAppMessageHandlers } from './index';
import { ConversationDataService } from '../conversation-data/conversation-data.service';
import {
  CANCEL_ALL_ID,
  ConversationStep,
  FullMenuOption,
  ScheduleConfirmOption,
  ScheduleMenuOption,
} from '../conversation-data';

type SentMessage = {
  type: string;
  text: string;
  options: Array<{ id: string; title: string }>;
};

const FROM = '5511999999999';

/**
 * Driver que reproduz o dispatch real do WhatsAppService:
 * - cada mensagem recebida é tratada pelo handler do step atual;
 * - callHandler reusa o mesmo texto e relê o estado fresco (igual ao executeHandler).
 */
function createDriver(handlers: WhatsAppMessageHandlers) {
  const conv = new ConversationDataService();
  const outbox: SentMessage[] = [];

  async function invoke(step: ConversationStep, text?: string): Promise<void> {
    await handlers.messageHandlers[step]({
      data: { from: FROM, phoneNumberId: 'PN', text },
      conversationData: conv.getState(FROM),
      setState: (key, update) => conv.setState(key, update),
      resetState: (key) => conv.resetState(key),
      sendMessage: async (type, msgText, options = []) => {
        outbox.push({ type, text: msgText, options });
      },
      callHandler: (next) => invoke(next, text),
    });
  }

  return {
    conv,
    outbox,
    last: () => outbox[outbox.length - 1],
    step: () => conv.getState(FROM).step,
    seed: (state: Parameters<ConversationDataService['setState']>[1]) =>
      conv.setState(FROM, state),
    render: (step: ConversationStep) => invoke(step),
    send: async (text: string) => invoke(conv.getState(FROM).step, text),
  };
}

function buildMocks() {
  const appointmentService = {
    findManyByUserId: jest.fn(),
    findUnique: jest.fn(),
    getAvailableSlotsForDay: jest.fn(),
    getNextAvailableSlots: jest.fn(),
    create: jest.fn().mockResolvedValue(null),
    reschedule: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
    cancelAllByUserId: jest.fn().mockResolvedValue(undefined),
  };
  const userService = {
    getNameById: jest.fn().mockResolvedValue('Rodrigo'),
  };
  return { appointmentService, userService };
}

const SAMPLE_DAY = {
  date: '2026-02-05',
  weekday: 4,
  weekdayLabel: 'Quinta-feira',
  slots: ['15:00', '16:00'],
};

describe('WhatsApp - fluxo de agendamento', () => {
  it('agenda por dia: menu → dia → lista → confirma → cria', async () => {
    const { appointmentService, userService } = buildMocks();
    appointmentService.getAvailableSlotsForDay.mockResolvedValue([SAMPLE_DAY]);

    const handlers = new WhatsAppMessageHandlers(userService as any, appointmentService as any);
    const d = createDriver(handlers);
    d.seed({ step: ConversationStep.SCHEDULE_MENU, userId: 1, data: null, context: null });

    await d.render(ConversationStep.SCHEDULE_MENU);
    expect(d.last().type).toBe('button');
    expect(d.step()).toBe(ConversationStep.SCHEDULE_MENU_REPLY);

    await d.send(ScheduleMenuOption.BY_DAY);
    expect(d.last().text).toContain('Digite o dia');
    expect(d.step()).toBe(ConversationStep.SCHEDULE_BY_DAY_LIST);

    await d.send('05/02');
    expect(d.last().type).toBe('list');
    // 2 horários + linha "Voltar"
    expect(d.last().options).toHaveLength(3);
    expect(d.step()).toBe(ConversationStep.SCHEDULE_CONFIRM);

    const slotId = d.last().options[0].id;
    expect(slotId).toBe('2026-02-05T15:00:00-03:00');

    await d.send(slotId);
    expect(d.last().text).toContain('Confirma o agendamento');
    expect(d.step()).toBe(ConversationStep.SCHEDULE_CONFIRMED);

    await d.send(ScheduleConfirmOption.CONFIRM);
    expect(appointmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, workerId: 1, datetime: slotId }),
    );
    expect(d.last().text).toContain('Agendamento confirmado');
    expect(d.step()).toBe(ConversationStep.CLOSE);
  });

  it('agenda por dia inválido: mantém o step e pede o formato', async () => {
    const { appointmentService, userService } = buildMocks();
    const handlers = new WhatsAppMessageHandlers(userService as any, appointmentService as any);
    const d = createDriver(handlers);
    d.seed({ step: ConversationStep.SCHEDULE_BY_DAY_LIST, userId: 1, data: null, context: null });

    await d.send('texto qualquer');
    expect(d.last().text).toContain('Formato inválido');
    expect(d.step()).toBe(ConversationStep.SCHEDULE_BY_DAY_LIST);
    expect(appointmentService.getAvailableSlotsForDay).not.toHaveBeenCalled();
  });
});

describe('WhatsApp - fluxo de remarcação', () => {
  it('remarca 1 agendamento reusando o fluxo de horário e chama reschedule()', async () => {
    const { appointmentService, userService } = buildMocks();
    appointmentService.findManyByUserId.mockResolvedValue([
      { id: 7, datetime: new Date('2026-02-16T22:00:00-03:00'), workerId: 1, googleEventId: 'ev' },
    ]);
    appointmentService.getAvailableSlotsForDay.mockResolvedValue([SAMPLE_DAY]);

    const handlers = new WhatsAppMessageHandlers(userService as any, appointmentService as any);
    const d = createDriver(handlers);
    d.seed({ step: ConversationStep.FULL_MENU, userId: 1, data: null, context: null });

    await d.render(ConversationStep.FULL_MENU);
    expect(d.step()).toBe(ConversationStep.FULL_MENU_REPLY);

    await d.send(FullMenuOption.RESCHEDULE);
    // após startReschedule cai no menu de horário
    expect(d.step()).toBe(ConversationStep.SCHEDULE_MENU_REPLY);

    await d.send(ScheduleMenuOption.BY_DAY);
    await d.send('05/02');
    expect(d.step()).toBe(ConversationStep.SCHEDULE_CONFIRM);

    const newSlotId = d.last().options[0].id;
    await d.send(newSlotId);
    expect(d.last().text).toContain('Confirma reagendar');
    expect(d.step()).toBe(ConversationStep.RESCHEDULE_CONFIRM);

    await d.send(ScheduleConfirmOption.CONFIRM);
    expect(appointmentService.reschedule).toHaveBeenCalledWith(7, newSlotId);
    expect(d.last().text).toContain('remarcada');
    expect(d.step()).toBe(ConversationStep.CLOSE);
    // contexto de remarcação foi limpo
    expect(d.conv.getState(FROM).context).toBeNull();
  });
});

describe('WhatsApp - fluxo de cancelamento', () => {
  it('cancela todos: menu → lista → "Cancelar todos" → confirma → cancelAllByUserId()', async () => {
    const { appointmentService, userService } = buildMocks();
    appointmentService.findManyByUserId.mockResolvedValue([
      { id: 7, datetime: new Date('2026-02-16T22:00:00-03:00'), workerId: 1, googleEventId: 'a' },
      { id: 8, datetime: new Date('2026-02-18T14:00:00-03:00'), workerId: 1, googleEventId: 'b' },
    ]);

    const handlers = new WhatsAppMessageHandlers(userService as any, appointmentService as any);
    const d = createDriver(handlers);
    d.seed({ step: ConversationStep.FULL_MENU, userId: 1, data: null, context: null });

    await d.render(ConversationStep.FULL_MENU);
    await d.send(FullMenuOption.CANCEL);
    expect(d.last().type).toBe('list');
    expect(d.last().options.map((o) => o.id)).toContain(CANCEL_ALL_ID);
    expect(d.step()).toBe(ConversationStep.CANCEL_MANY);

    await d.send(CANCEL_ALL_ID);
    expect(d.last().text).toContain('cancelar');
    expect(d.step()).toBe(ConversationStep.CANCEL_CONFIRM_ALL);

    await d.send(ScheduleConfirmOption.CONFIRM);
    expect(appointmentService.cancelAllByUserId).toHaveBeenCalledWith(1);
    expect(d.last().text).toContain('Todos os seus agendamentos foram cancelados');
    expect(d.step()).toBe(ConversationStep.CLOSE);
  });

  it('cancela 1 de vários: seleciona da lista → confirma → cancel(id)', async () => {
    const { appointmentService, userService } = buildMocks();
    appointmentService.findManyByUserId.mockResolvedValue([
      { id: 7, datetime: new Date('2026-02-16T22:00:00-03:00'), workerId: 1, googleEventId: 'a' },
      { id: 8, datetime: new Date('2026-02-18T14:00:00-03:00'), workerId: 1, googleEventId: 'b' },
    ]);
    appointmentService.findUnique.mockResolvedValue({
      id: 8,
      datetime: new Date('2026-02-18T14:00:00-03:00'),
      workerId: 1,
      googleEventId: 'b',
    });

    const handlers = new WhatsAppMessageHandlers(userService as any, appointmentService as any);
    const d = createDriver(handlers);
    d.seed({ step: ConversationStep.FULL_MENU, userId: 1, data: null, context: null });

    await d.render(ConversationStep.FULL_MENU);
    await d.send(FullMenuOption.CANCEL);
    await d.send('8');
    expect(d.last().text).toContain('Deseja realmente cancelar');
    expect(d.step()).toBe(ConversationStep.CANCEL_CONFIRM);

    await d.send(ScheduleConfirmOption.CONFIRM);
    expect(appointmentService.cancel).toHaveBeenCalledWith(8);
    expect(d.last().text).toContain('Seu agendamento foi cancelado');
    expect(d.step()).toBe(ConversationStep.CLOSE);
  });
});
