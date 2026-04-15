export enum ConversationStep {
  SIGN_IN = 'SIGN_IN',
  SIGN_IN_GET_NAME = 'SIGN_IN_GET_NAME',
  SIGN_IN_GET_EMAIL = 'SIGN_IN_GET_EMAIL',
  SIGN_IN_CONFIRM = 'SIGN_IN_CONFIRM',

  CHECK_APT = 'CHECK_APT',

  FULL_MENU = 'FULL_MENU',

  CANCEL_MANY = 'CANCEL_MANY',
  CANCEL_CONFIRM = 'CANCEL_CONFIRM',
  CANCEL_CONFIRM_ALL = 'CANCEL_CONFIRM_ALL',
  CANCEL_CONFIRMED = 'CANCEL_CONFIRMED',

  RESCHEDULE_MANY = 'RESCHEDULE_MANY',
  RESCHEDULE_CONFIRM = 'RESCHEDULE_CONFIRM',

  SCHEDULE_MENU = 'SCHEDULE_MENU',
  SCHEDULE_MENU_REPLY = 'SCHEDULE_MENU_REPLY',
  SCHEDULE_BY_DAY = 'SCHEDULE_BY_DAY',
  SCHEDULE_BY_DAY_LIST = 'SCHEDULE_BY_DAY_LIST',

  SCHEDULE_NEXT_AVAILABLE_LIST = 'SCHEDULE_NEXT_AVAILABLE_LIST',

  SCHEDULE_BY_DAY_HOUR = 'SCHEDULE_BY_DAY_HOUR',
  SCHEDULE_BY_DAY_HOUR_UNAVAILABLE = 'SCHEDULE_BY_DAY_HOUR_UNAVAILABLE',

  SCHEDULE_CONFIRM = 'SCHEDULE_CONFIRM',
  SCHEDULE_CONFIRMED = 'SCHEDULE_CONFIRMED',

  CLOSE = 'CLOSE',
}

export enum SignInConfirmOption {
  CONFIRM = 'sign_in_confirm',
  RETRY = 'sign_in_retry',
}

export enum ScheduleMenuOption {
  NEXT_APPOINTMENTS = 'next_appointments',
  BY_DAY = 'by_day',
}

export const ScheduleMenuLabels: Record<ScheduleMenuOption, string> = {
  [ScheduleMenuOption.NEXT_APPOINTMENTS]: 'Próximos horários',
  [ScheduleMenuOption.BY_DAY]: 'Escolher por dia',
};

export interface ConversationData {
  step: ConversationStep;
  data: string | null;
  userId: number | null;
}

export type ConversationDataUpdate = Partial<ConversationData>;
