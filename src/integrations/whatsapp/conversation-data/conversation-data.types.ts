export enum ConversationStep {
  SIGN_IN = 'SIGN_IN',
  SIGN_IN_GET_NAME = 'SIGN_IN_GET_NAME',
  SIGN_IN_GET_EMAIL = 'SIGN_IN_GET_EMAIL',
  SIGN_IN_CONFIRM = 'SIGN_IN_CONFIRM',

  CHECK_APT = 'CHECK_APT',

  FULL_MENU = 'FULL_MENU',
  FULL_MENU_REPLY = 'FULL_MENU_REPLY',

  MORE_MENU = 'MORE_MENU',
  MORE_MENU_REPLY = 'MORE_MENU_REPLY',

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

  // Fluxo do barbeiro (worker)
  WORKER_MENU = 'WORKER_MENU',
  WORKER_MENU_REPLY = 'WORKER_MENU_REPLY',

  WORKER_CLIENT_MENU = 'WORKER_CLIENT_MENU',
  WORKER_CLIENT_MENU_REPLY = 'WORKER_CLIENT_MENU_REPLY',
  WORKER_SHOP_MENU = 'WORKER_SHOP_MENU',
  WORKER_SHOP_MENU_REPLY = 'WORKER_SHOP_MENU_REPLY',
  WORKER_BOOKING_MENU = 'WORKER_BOOKING_MENU',
  WORKER_BOOKING_MENU_REPLY = 'WORKER_BOOKING_MENU_REPLY',

  // Busca de cliente por nome (reusada por agendar/remarcar/cancelar/atualizar)
  WORKER_CLIENT_SEARCH = 'WORKER_CLIENT_SEARCH',
  WORKER_CLIENT_SEARCH_RESULTS = 'WORKER_CLIENT_SEARCH_RESULTS',
  WORKER_CLIENT_SEARCH_PICK = 'WORKER_CLIENT_SEARCH_PICK',
  WORKER_CLIENT_SEARCH_EMPTY = 'WORKER_CLIENT_SEARCH_EMPTY',

  // Cadastrar cliente
  WORKER_CLIENT_CREATE = 'WORKER_CLIENT_CREATE',
  WORKER_CLIENT_CREATE_PHONE = 'WORKER_CLIENT_CREATE_PHONE',
  WORKER_CLIENT_CREATE_NAME = 'WORKER_CLIENT_CREATE_NAME',
  WORKER_CLIENT_CREATE_EMAIL = 'WORKER_CLIENT_CREATE_EMAIL',
  WORKER_CLIENT_CREATE_CONFIRM = 'WORKER_CLIENT_CREATE_CONFIRM',
  WORKER_CLIENT_CREATED = 'WORKER_CLIENT_CREATED',

  // Atualizar cliente
  WORKER_CLIENT_UPDATE_FIELD = 'WORKER_CLIENT_UPDATE_FIELD',
  WORKER_CLIENT_UPDATE_FIELD_REPLY = 'WORKER_CLIENT_UPDATE_FIELD_REPLY',
  WORKER_CLIENT_UPDATE_INPUT = 'WORKER_CLIENT_UPDATE_INPUT',
  WORKER_CLIENT_UPDATE_CONFIRM = 'WORKER_CLIENT_UPDATE_CONFIRM',

  // Indisponibilizar horário
  WORKER_UNAVAIL_DAY = 'WORKER_UNAVAIL_DAY',
  WORKER_UNAVAIL_DAY_INPUT = 'WORKER_UNAVAIL_DAY_INPUT',
  WORKER_UNAVAIL_SCOPE = 'WORKER_UNAVAIL_SCOPE',
  WORKER_UNAVAIL_HOURS = 'WORKER_UNAVAIL_HOURS',
  WORKER_UNAVAIL_CONFLICTS = 'WORKER_UNAVAIL_CONFLICTS',

  // Horário de funcionamento
  WORKER_HOURS_MENU = 'WORKER_HOURS_MENU',
  WORKER_HOURS_MENU_REPLY = 'WORKER_HOURS_MENU_REPLY',
  WORKER_HOURS_INPUT = 'WORKER_HOURS_INPUT',

  // Fixar / desfixar cliente (recorrência semanal)
  WORKER_FIX_PICK_APT = 'WORKER_FIX_PICK_APT',
  WORKER_FIX_WEEKDAY = 'WORKER_FIX_WEEKDAY',
  WORKER_FIX_WEEKDAY_REPLY = 'WORKER_FIX_WEEKDAY_REPLY',
  WORKER_FIX_TIME = 'WORKER_FIX_TIME',
  WORKER_FIX_CONFIRM = 'WORKER_FIX_CONFIRM',
  WORKER_UNFIX_PICK = 'WORKER_UNFIX_PICK',
  WORKER_UNFIX_CONFIRM = 'WORKER_UNFIX_CONFIRM',

  CLOSE = 'CLOSE',
}

/** Papel da identidade que está conversando pelo WhatsApp. */
export type ConversationRole = 'user' | 'worker';

/** Customização opcional de uma mensagem do tipo `list` (cabeçalho/botão/seção). */
export interface ListConfig {
  header?: string;
  button?: string;
  sectionTitle?: string;
}

// ============================================================
// Menu do barbeiro (worker)
// ============================================================

export enum WorkerMenuOption {
  CLIENT = 'worker_menu_client',
  SHOP = 'worker_menu_shop',
  BOOKING = 'worker_menu_booking',
}

export const WorkerMenuLabels: Record<WorkerMenuOption, string> = {
  [WorkerMenuOption.CLIENT]: '👤 Cliente',
  [WorkerMenuOption.SHOP]: '🏪 Barbearia',
  [WorkerMenuOption.BOOKING]: '📅 Agendamento',
};

export enum WorkerClientMenuOption {
  CREATE = 'worker_client_create',
  UPDATE = 'worker_client_update',
  FIX = 'worker_client_fix',
  UNFIX = 'worker_client_unfix',
  BACK = 'worker_client_back',
}

export const WorkerClientMenuLabels: Record<WorkerClientMenuOption, string> = {
  [WorkerClientMenuOption.CREATE]: '➕ Cadastrar cliente',
  [WorkerClientMenuOption.UPDATE]: '✏️ Atualizar cliente',
  [WorkerClientMenuOption.FIX]: '📌 Fixar horário',
  [WorkerClientMenuOption.UNFIX]: '🗑️ Desfixar horário',
  [WorkerClientMenuOption.BACK]: '↩️ Voltar',
};

export enum WorkerShopMenuOption {
  UNAVAILABLE = 'worker_shop_unavailable',
  WORKING_HOURS = 'worker_shop_working_hours',
  BACK = 'worker_shop_back',
}

export const WorkerShopMenuLabels: Record<WorkerShopMenuOption, string> = {
  [WorkerShopMenuOption.UNAVAILABLE]: '🚫 Indisponibilizar',
  [WorkerShopMenuOption.WORKING_HOURS]: '🕐 Horário de func.',
  [WorkerShopMenuOption.BACK]: '↩️ Voltar',
};

/** Prefixo do id da linha de um dia da semana no menu de horário de funcionamento. */
export const WORKER_HOURS_DAY_PREFIX = 'hours_day_';

/** Id da opção "aplicar aos dias úteis" no menu de horário de funcionamento. */
export const WORKER_HOURS_WEEKDAYS_ID = 'hours_weekdays';

/** Prefixo do id da linha de um dia da semana no fluxo de fixar cliente. */
export const WORKER_FIX_DAY_PREFIX = 'fix_day_';

/** Id da opção "outro horário" (informar dia/hora) no fluxo de fixar. */
export const WORKER_FIX_OTHER_TIME_ID = 'fix_other_time';

export enum WorkerBookingMenuOption {
  SCHEDULE = 'worker_booking_schedule',
  RESCHEDULE = 'worker_booking_reschedule',
  CANCEL = 'worker_booking_cancel',
  BACK = 'worker_booking_back',
}

export const WorkerBookingMenuLabels: Record<WorkerBookingMenuOption, string> = {
  [WorkerBookingMenuOption.SCHEDULE]: '📅 Agendar',
  [WorkerBookingMenuOption.RESCHEDULE]: '🔄 Remarcar',
  [WorkerBookingMenuOption.CANCEL]: '❌ Cancelar',
  [WorkerBookingMenuOption.BACK]: '↩️ Voltar',
};

export enum ClientUpdateFieldOption {
  PHONE = 'client_update_phone',
  NAME = 'client_update_name',
  EMAIL = 'client_update_email',
  BACK = 'client_update_back',
}

export const ClientUpdateFieldLabels: Record<ClientUpdateFieldOption, string> = {
  [ClientUpdateFieldOption.PHONE]: '📞 Telefone',
  [ClientUpdateFieldOption.NAME]: '🪪 Nome',
  [ClientUpdateFieldOption.EMAIL]: '📧 Email',
  [ClientUpdateFieldOption.BACK]: '↩️ Voltar',
};

export enum UnavailableScopeOption {
  ALL_DAY = 'unavail_all_day',
  HOURS = 'unavail_hours',
  BACK = 'unavail_back',
}

export const UnavailableScopeLabels: Record<UnavailableScopeOption, string> = {
  [UnavailableScopeOption.ALL_DAY]: '📅 Dia todo',
  [UnavailableScopeOption.HOURS]: '⏰ Específico',
  [UnavailableScopeOption.BACK]: '↩️ Voltar',
};

/** Id da linha "Voltar" injetada na lista de resultados de busca de cliente. */
export const WORKER_SEARCH_BACK_ID = 'worker_search_back';

/** Id genérico de "Voltar" usado em prompts/menus dos fluxos do barbeiro. */
export const BACK_ID = 'go_back';

/** Rótulo padrão do botão/linha de voltar. */
export const BACK_LABEL = '↩️ Voltar';

/** Opções oferecidas quando a busca de cliente não retorna resultados. */
export enum WorkerSearchEmptyOption {
  CREATE = 'worker_search_empty_create',
  RETRY = 'worker_search_empty_retry',
  BACK = 'worker_search_empty_back',
}

export const WorkerSearchEmptyLabels: Record<WorkerSearchEmptyOption, string> = {
  [WorkerSearchEmptyOption.CREATE]: '➕ Cadastrar',
  [WorkerSearchEmptyOption.RETRY]: '🔁 Outro nome',
  [WorkerSearchEmptyOption.BACK]: '↩️ Voltar',
};

/** Opções após concluir o cadastro de um cliente pelo barbeiro. */
export enum WorkerCreatedOption {
  SCHEDULE = 'worker_created_schedule',
  MENU = 'worker_created_menu',
}

export const WorkerCreatedLabels: Record<WorkerCreatedOption, string> = {
  [WorkerCreatedOption.SCHEDULE]: '📅 Agendar agora',
  [WorkerCreatedOption.MENU]: '🏠 Voltar ao menu',
};

/** Ação do barbeiro que opera sobre um cliente-alvo escolhido pela busca. */
export type WorkerAction =
  | 'schedule'
  | 'reschedule'
  | 'cancel'
  | 'update'
  | 'fix'
  | 'unfix';

/** Contexto do barbeiro agindo em nome de um cliente (serializado em `context`). */
export interface WorkerActionContext {
  mode: 'worker_action';
  action: WorkerAction;
  targetUserId: number;
}

export enum SignInConfirmOption {
  CONFIRM = 'sign_in_confirm',
  RETRY = 'sign_in_retry',
}

export enum FullMenuOption {
  LIST = 'full_menu_list',
  CANCEL = 'full_menu_cancel',
  MORE = 'full_menu_more',
}

export const FullMenuLabels: Record<FullMenuOption, string> = {
  [FullMenuOption.LIST]: '📋 Meus agendamentos',
  [FullMenuOption.CANCEL]: '❌ Cancelar',
  [FullMenuOption.MORE]: '➕ Mais opções',
};

export enum MoreMenuOption {
  RESCHEDULE = 'more_menu_reschedule',
  SCHEDULE = 'more_menu_schedule',
  BACK = 'more_menu_back',
}

export const MoreMenuLabels: Record<MoreMenuOption, string> = {
  [MoreMenuOption.RESCHEDULE]: '🔄 Remarcar',
  [MoreMenuOption.SCHEDULE]: '📅 Agendar',
  [MoreMenuOption.BACK]: '↩️ Voltar',
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
  [ScheduleMenuOption.NEXT_APPOINTMENTS]: '⏰ Próximos horários',
  [ScheduleMenuOption.BY_DAY]: '🗓️ Escolher por dia',
};

export enum ScheduleConfirmOption {
  CONFIRM = 'schedule_confirm',
  DECLINE = 'schedule_decline',
}

export const ScheduleConfirmLabels: Record<ScheduleConfirmOption, string> = {
  [ScheduleConfirmOption.CONFIRM]: '✅ Sim',
  [ScheduleConfirmOption.DECLINE]: '🚫 Não',
};

export enum CloseMenuOption {
  BACK = 'close_back',
  END = 'close_end',
}

export const CloseMenuLabels: Record<CloseMenuOption, string> = {
  [CloseMenuOption.BACK]: '↩️ Voltar',
  [CloseMenuOption.END]: '👋 Encerrar',
};

/** Id da linha "Voltar" injetada nas listas de horários. */
export const SCHEDULE_LIST_BACK_ID = 'schedule_list_back';

/** Id da linha "Cancelar todos" na lista de cancelamento. */
export const CANCEL_ALL_ID = 'cancel_all';

export interface ConversationData {
  step: ConversationStep;
  data: string | null;
  userId: number | null;
  /** Papel desta identidade: cliente ('user') ou barbeiro ('worker'). */
  role: ConversationRole;
  /** Quando role === 'worker', id do profissional vinculado (user.workerId). */
  workerId: number | null;
  /** Contexto de fluxo (JSON) que sobrevive entre steps, ex.: remarcação em andamento. */
  context: string | null;
}

export type ConversationDataUpdate = Partial<ConversationData>;
