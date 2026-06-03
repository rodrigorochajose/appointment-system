export enum ConversationStep {
  SIGN_IN = 'SIGN_IN',
  SIGN_IN_GET_NAME = 'SIGN_IN_GET_NAME',
  SIGN_IN_GET_EMAIL = 'SIGN_IN_GET_EMAIL',
  SIGN_IN_CONFIRM = 'SIGN_IN_CONFIRM',

  CHECK_APT = 'CHECK_APT',

  FULL_MENU = 'FULL_MENU',
  FULL_MENU_REPLY = 'FULL_MENU_REPLY',

  CANCEL_MANY = 'CANCEL_MANY',
  CANCEL_CONFIRM = 'CANCEL_CONFIRM',
  CANCEL_CONFIRM_ALL = 'CANCEL_CONFIRM_ALL',

  RESCHEDULE_MANY = 'RESCHEDULE_MANY',
  RESCHEDULE_CONFIRM = 'RESCHEDULE_CONFIRM',

  SCHEDULE_MENU = 'SCHEDULE_MENU',
  SCHEDULE_MENU_REPLY = 'SCHEDULE_MENU_REPLY',
  SCHEDULE_BY_DAY = 'SCHEDULE_BY_DAY',
  SCHEDULE_BY_DAY_LIST = 'SCHEDULE_BY_DAY_LIST',

  SCHEDULE_NEXT_AVAILABLE_LIST = 'SCHEDULE_NEXT_AVAILABLE_LIST',

  SCHEDULE_BY_DAY_HOUR_UNAVAILABLE = 'SCHEDULE_BY_DAY_HOUR_UNAVAILABLE',

  SCHEDULE_CHECK_AVAILABILITY = 'SCHEDULE_CHECK_AVAILABILITY',
  SCHEDULE_CONFIRM = 'SCHEDULE_CONFIRM',
  SCHEDULE_CONFIRMED = 'SCHEDULE_CONFIRMED',

  CLOSE = 'CLOSE',
}

export enum SignInConfirmOption {
  CONFIRM = 'sign_in_confirm',
  RETRY = 'sign_in_retry',
}

export enum FullMenuOption {
  SCHEDULE = 'full_menu_schedule',
  RESCHEDULE = 'full_menu_reschedule',
  CANCEL = 'full_menu_cancel',
}

export const FullMenuLabels: Record<FullMenuOption, string> = {
  [FullMenuOption.SCHEDULE]: 'Agendar',
  [FullMenuOption.RESCHEDULE]: 'Remarcar',
  [FullMenuOption.CANCEL]: 'Cancelar',
};

export enum ScheduleMenuOption {
  NEXT_APPOINTMENTS = 'next_appointments',
  BY_DAY = 'by_day',
}

/** Contexto de fluxo carregado entre steps enquanto o cliente remarca. */
export interface RescheduleContext {
  mode: 'reschedule';
  appointmentId: number;
  oldIso: string;
}

export const ScheduleMenuLabels: Record<ScheduleMenuOption, string> = {
  [ScheduleMenuOption.NEXT_APPOINTMENTS]: 'Próximos horários',
  [ScheduleMenuOption.BY_DAY]: 'Escolher por dia',
};

export enum ScheduleConfirmOption {
  CONFIRM = 'schedule_confirm',
  DECLINE = 'schedule_decline',
}

export const ScheduleConfirmLabels: Record<ScheduleConfirmOption, string> = {
  [ScheduleConfirmOption.CONFIRM]: 'Sim',
  [ScheduleConfirmOption.DECLINE]: 'Não',
};

export enum CloseMenuOption {
  BACK = 'close_back',
  END = 'close_end',
}

export const CloseMenuLabels: Record<CloseMenuOption, string> = {
  [CloseMenuOption.BACK]: 'Voltar',
  [CloseMenuOption.END]: 'Encerrar',
};

/** Id da linha "Voltar" injetada nas listas de horários. */
export const SCHEDULE_LIST_BACK_ID = 'schedule_list_back';

/** Id da linha "Cancelar todos" na lista de cancelamento. */
export const CANCEL_ALL_ID = 'cancel_all';

export interface ConversationData {
  step: ConversationStep;
  data: string | null;
  userId: number | null;
  /** Contexto de fluxo (JSON) que sobrevive entre steps, ex.: remarcação em andamento. */
  context: string | null;
}

export type ConversationDataUpdate = Partial<ConversationData>;
